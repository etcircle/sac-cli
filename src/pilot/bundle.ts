import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import {
  dataActionManifestSchema,
  deploymentStateSchema,
  evidenceManifestSchema,
  proofInputsSchema,
  storyManifestSchema,
  widgetManifestSchema,
  type DataActionManifest,
  type DeploymentState,
  type EvidenceManifest,
  type ProofInputs,
  type StoryManifest,
  type WidgetManifest
} from './schema.js';

export type PilotBundleInspection = {
  bundleRoot: string;
  proofInputs: ProofInputs;
  dataAction: DataActionManifest;
  story: StoryManifest;
  widgets: WidgetManifest[];
  deploymentState: DeploymentState;
  evidenceManifest: EvidenceManifest;
  acceptanceChecks: string[];
  fileFingerprints: Record<string, string>;
  bundleFingerprint: string;
};

function createPilotBundleInvalidError(message: string): CliError {
  return new CliError('PILOT_BUNDLE_INVALID', `Pilot bundle is invalid: ${message}`, ExitCode.InvalidInput);
}

async function readYamlFile<T>(filePath: string, parser: { parse: (value: unknown) => T }): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return parser.parse(parseYaml(raw));
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createPilotBundleInvalidError(`missing required file "${path.basename(filePath)}".`);
    }

    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const issuePath = firstIssue?.path.join('.') || 'root';
      throw createPilotBundleInvalidError(`"${path.basename(filePath)}" failed schema validation at "${issuePath}": ${firstIssue?.message ?? 'invalid value'}.`);
    }

    throw createPilotBundleInvalidError(`could not parse "${path.basename(filePath)}": ${error instanceof Error ? error.message : 'unknown parse failure'}.`);
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    throw createPilotBundleInvalidError(`missing required file "${path.relative(path.dirname(filePath), filePath)}".`);
  }
}

async function assertBundleFileExists(bundleRoot: string, relativeFile: string, why: string): Promise<string> {
  const absolutePath = path.join(bundleRoot, relativeFile);
  try {
    await access(absolutePath);
    return absolutePath;
  } catch {
    throw createPilotBundleInvalidError(`${why} points to missing file "${relativeFile}".`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function createBundleFingerprint(fileFingerprints: Record<string, string>): string {
  const orderedEntries = Object.entries(fileFingerprints).sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify(orderedEntries));
}

async function assertNoExtraFiles(bundleRoot: string, relativeDir: string, expectedFiles: string[], extension: string): Promise<void> {
  const absoluteDir = path.join(bundleRoot, relativeDir);
  const expected = new Set(expectedFiles);
  const actual = (await readdir(absoluteDir))
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => path.join(relativeDir, entry));

  const extras = actual.filter((entry) => !expected.has(entry)).sort();
  if (extras.length > 0) {
    throw createPilotBundleInvalidError(`unexpected file(s) in "${relativeDir}": ${extras.join(', ')}.`);
  }
}

export async function inspectPilotBundle(projectRoot: string = process.cwd()): Promise<PilotBundleInspection> {
  const bundleRoot = path.join(projectRoot, 'pilot');

  const proofInputs = await readYamlFile(path.join(bundleRoot, 'proof-inputs.yaml'), proofInputsSchema);
  const dataAction = await readYamlFile(path.join(bundleRoot, 'data-action.yaml'), dataActionManifestSchema);
  const story = await readYamlFile(path.join(bundleRoot, 'story.yaml'), storyManifestSchema);
  const deploymentState = await readYamlFile(path.join(bundleRoot, 'deployment-state.yaml'), deploymentStateSchema);
  const evidenceManifest = await readYamlFile(path.join(bundleRoot, 'evidence', 'manifest.yaml'), evidenceManifestSchema);

  if (proofInputs.story.key !== story.key) {
    throw createPilotBundleInvalidError('proof-inputs story key must match story manifest key.');
  }

  if (proofInputs.dataAction.key !== dataAction.key) {
    throw createPilotBundleInvalidError('proof-inputs data-action key must match data-action manifest key.');
  }

  if (deploymentState.story.key !== story.key) {
    throw createPilotBundleInvalidError('deployment-state story key must match story manifest key.');
  }

  if (deploymentState.story.resourceId !== proofInputs.story.resourceId) {
    throw createPilotBundleInvalidError('deployment-state story resourceId must match proof inputs.');
  }

  if (deploymentState.dataAction.key !== dataAction.key) {
    throw createPilotBundleInvalidError('deployment-state data-action key must match data-action manifest key.');
  }

  if (deploymentState.tenantBaseUrl !== proofInputs.tenant.baseUrl) {
    throw createPilotBundleInvalidError('deployment-state tenantBaseUrl must match proof inputs tenant baseUrl.');
  }

  if (deploymentState.dataAction.objectName !== proofInputs.dataAction.objectName) {
    throw createPilotBundleInvalidError('deployment-state data-action objectName must match proof inputs.');
  }

  if (dataAction.defaultModel.id !== proofInputs.dataAction.defaultModelId) {
    throw createPilotBundleInvalidError('data-action default model id must match proof inputs.');
  }

  const matchingProofStep = dataAction.steps.filter((step) => step.name === proofInputs.dataAction.stepName);
  if (matchingProofStep.length !== 1) {
    throw createPilotBundleInvalidError(`proof inputs stepName "${proofInputs.dataAction.stepName}" must resolve to exactly one data-action step.`);
  }

  const pageKeys = new Set(story.pages.map((page) => page.key));
  const referencedWidgetKeys = [...new Set(story.pages.flatMap((page) => page.widgets))];
  const widgets = await Promise.all(
    referencedWidgetKeys.map(async (widgetKey) => {
      const widgetPath = await assertBundleFileExists(bundleRoot, path.join('widgets', `${widgetKey}.yaml`), `story widget "${widgetKey}"`);
      const widget = await readYamlFile(widgetPath, widgetManifestSchema);

      if (widget.key !== widgetKey) {
        throw createPilotBundleInvalidError(`widget file "widgets/${widgetKey}.yaml" must declare key "${widgetKey}".`);
      }

      if (widget.story !== story.key) {
        throw createPilotBundleInvalidError(`widget "${widgetKey}" must point at story "${story.key}".`);
      }

      if (!pageKeys.has(widget.page)) {
        throw createPilotBundleInvalidError(`widget "${widgetKey}" points at unknown page "${widget.page}".`);
      }

      const deploymentWidget = deploymentState.widgets[widgetKey];
      if (!deploymentWidget) {
        throw createPilotBundleInvalidError(`deployment-state is missing widget mapping for "${widgetKey}".`);
      }

      if (deploymentWidget.story !== widget.story || deploymentWidget.page !== widget.page) {
        throw createPilotBundleInvalidError(`deployment-state widget mapping for "${widgetKey}" does not match widget manifest.`);
      }

      return widget;
    })
  );
  const widgetMap = new Map(widgets.map((widget) => [widget.key, widget]));
  const seenWidgetKeys = new Set<string>();

  for (const page of story.pages) {
    for (const widgetKey of page.widgets) {
      if (seenWidgetKeys.has(widgetKey)) {
        throw createPilotBundleInvalidError(`story manifest references widget "${widgetKey}" more than once.`);
      }
      seenWidgetKeys.add(widgetKey);

      const widget = widgetMap.get(widgetKey);
      if (!widget) {
        throw createPilotBundleInvalidError(`story page "${page.key}" references unknown widget "${widgetKey}".`);
      }

      if (widget.page !== page.key) {
        throw createPilotBundleInvalidError(`story page "${page.key}" references widget "${widgetKey}" but widget manifest points at page "${widget.page}".`);
      }
    }
  }

  for (const step of dataAction.steps) {
    const stepPath = await assertBundleFileExists(bundleRoot, step.file, `data-action step "${step.key}"`);
    const deploymentStepId = deploymentState.dataAction.stepIds[step.key];
    if (!deploymentStepId) {
      throw createPilotBundleInvalidError(`deployment-state is missing a step id for "${step.key}".`);
    }

    const stepSource = await readTextFile(stepPath);
    if (!stepSource.trim()) {
      throw createPilotBundleInvalidError(`data-action step "${step.key}" must not be empty.`);
    }
  }

  if (deploymentState.dataAction.stepIds[matchingProofStep[0].key] !== proofInputs.dataAction.stepId) {
    throw createPilotBundleInvalidError(`deployment-state step id for "${matchingProofStep[0].key}" must match proof inputs.`);
  }

  await assertNoExtraFiles(bundleRoot, 'steps', dataAction.steps.map((step) => step.file), '.af');
  await assertNoExtraFiles(bundleRoot, 'widgets', widgets.map((widget) => path.join('widgets', `${widget.key}.yaml`)), '.yaml');

  const filesToFingerprint = [
    'proof-inputs.yaml',
    'data-action.yaml',
    'story.yaml',
    'deployment-state.yaml',
    'evidence/manifest.yaml',
    ...dataAction.steps.map((step) => step.file),
    ...widgets.map((widget) => path.join('widgets', `${widget.key}.yaml`))
  ];

  const fileFingerprints = Object.fromEntries(
    await Promise.all(
      filesToFingerprint.map(async (relativeFile) => {
        const absolutePath = path.join(bundleRoot, relativeFile);
        const content = await readFile(absolutePath, 'utf8');
        return [relativeFile, sha256(content)] as const;
      })
    )
  );

  return {
    bundleRoot,
    proofInputs,
    dataAction,
    story,
    widgets,
    deploymentState,
    evidenceManifest,
    acceptanceChecks: evidenceManifest.acceptanceChecks,
    fileFingerprints,
    bundleFingerprint: createBundleFingerprint(fileFingerprints)
  };
}
