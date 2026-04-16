import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import { type SacCliProfile } from '../config/schema.js';
import { inspectPilotBundle, type PilotBundleInspection } from '../pilot/bundle.js';
import {
  type BrowserPage,
  type BrowserRuntime,
  type ManagedBrowserSession,
  createDefaultBrowserRuntime,
  ensureSacAppUrl,
  launchPersistentBrowserSession
} from '../session/browser-session.js';
import { type FormulaValidationResult } from './types.js';

export type FormulaProbeRun = {
  reopenedUrl: string;
  readbackText: string;
  selectorUsed: string;
  validation: FormulaValidationResult;
  raw?: Record<string, unknown>;
};

export type FormulaBrowserProbe = (input: {
  page: BrowserPage;
  inspection: PilotBundleInspection;
  expectedSource: string;
  targetUrl: string;
}) => Promise<FormulaProbeRun>;

export type VerifyPilotFormulaInput = {
  projectRoot?: string;
  evidenceDir?: string;
  profileName?: string;
};

export type VerifyPilotDependencies = {
  paths?: ConfigPaths;
  store?: ProfileStore;
  runtime?: BrowserRuntime;
  sessionFactory?: (profile: SacCliProfile) => Promise<ManagedBrowserSession>;
  probe?: FormulaBrowserProbe;
};

type NormalizedReadback = {
  mode: 'non-mutating';
  formula: {
    dataActionKey: string;
    dataActionObjectName: string;
    stepKey: string;
    stepName: string;
    stepId: string;
  };
  comparison: {
    matchesFrozenSource: boolean;
    expectedSourceHash: string;
    readbackSourceHash: string;
  };
  readback: {
    selectorUsed: string;
    normalizedSource: string;
  };
  validation: FormulaValidationResult;
  validationSource: 'dom-fallback';
};

type ObservedRun = {
  reopenedUrl: string;
  normalized: NormalizedReadback;
  normalizedHash: string;
  validation: FormulaValidationResult;
};

type StableJson = string | number | boolean | null | StableJson[] | { [key: string]: StableJson };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): StableJson {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stableJson(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)])
    );
  }

  return String(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJson(value), null, 2);
}

export function normalizeFormulaSource(source: string): string {
  return source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function buildTargetUrl(profile: SacCliProfile, route: string): string {
  const targetUrl = new URL(ensureSacAppUrl(profile.tenantUrl));
  targetUrl.hash = route.startsWith('#') ? route : `#${route}`;
  return targetUrl.toString();
}

function createFormulaProbeUnavailableError(): CliError {
  return new CliError(
    'FORMULA_PROBE_UNAVAILABLE',
    'The browser page does not expose evaluate(); the Advanced Formula readback probe cannot run.',
    ExitCode.GeneralError
  );
}

function createFormulaReadbackFailedError(): CliError {
  return new CliError(
    'FORMULA_READBACK_FAILED',
    'Could not read Advanced Formula text from the reopened editor surface.',
    ExitCode.GeneralError
  );
}

function createFormulaEditorRouteMismatchError(targetUrl: string, reopenedUrl: string): CliError {
  return new CliError(
    'FORMULA_EDITOR_ROUTE_MISMATCH',
    `The reopened editor route did not stay on the target data-action editor surface. Expected "${targetUrl}", got "${reopenedUrl}".`,
    ExitCode.GeneralError
  );
}

function createFormulaRepeatabilityFailedError(hashes: string[], evidenceDir: string): CliError {
  return new CliError(
    'FORMULA_REPEATABILITY_FAILED',
    `Normalized Advanced Formula readback hash changed across consecutive verify runs (${hashes.join(', ')}). Evidence written to "${evidenceDir}".`,
    ExitCode.GeneralError
  );
}

function createFormulaReadbackMismatchError(evidenceDir: string): CliError {
  return new CliError(
    'FORMULA_READBACK_MISMATCH',
    `Reopened Advanced Formula content did not match the frozen pilot source. Evidence written to "${evidenceDir}".`,
    ExitCode.GeneralError
  );
}

function createFormulaValidationInvalidError(evidenceDir: string): CliError {
  return new CliError(
    'FORMULA_VALIDATION_INVALID',
    `Advanced Formula validation returned issues for the reopened pilot target. Evidence written to "${evidenceDir}".`,
    ExitCode.GeneralError
  );
}

async function createSessionFactory(
  runtime?: BrowserRuntime
): Promise<(profile: SacCliProfile) => Promise<ManagedBrowserSession>> {
  const resolvedRuntime = runtime ?? await createDefaultBrowserRuntime();
  return async (profile: SacCliProfile) => launchPersistentBrowserSession(profile, resolvedRuntime);
}

function selectBestEditorCandidate(
  candidates: Array<{ selector: string; value: string; visible?: boolean }>,
  expectedSource: string
): { selector: string; value: string; visible?: boolean } | null {
  const expectedNormalized = normalizeFormulaSource(expectedSource);
  const expectedLines = expectedNormalized.split('\n').filter(Boolean);
  const trustedSelectors = new Set([
    'textarea',
    '.monaco-editor textarea',
    '.monaco-editor .view-lines',
    '.monaco-editor .view-line',
    '[role="textbox"]'
  ]);

  let best: { selector: string; value: string; visible?: boolean } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (!trustedSelectors.has(candidate.selector)) {
      continue;
    }

    if (candidate.visible === false) {
      continue;
    }

    const value = normalizeFormulaSource(candidate.value);
    if (!value) {
      continue;
    }

    const matchingLines = expectedLines.filter((line) => value.includes(line)).length;
    const exactMatchBonus = value === expectedNormalized ? 1_000_000 : 0;
    const lengthPenalty = Math.abs(expectedNormalized.length - value.length);
    const score = exactMatchBonus + matchingLines * 1_000 - lengthPenalty;

    if (score > bestScore) {
      best = {
        selector: candidate.selector,
        value
      };
      bestScore = score;
    }
  }

  return best;
}

function createValidationResult(messages: string[]): FormulaValidationResult {
  if (messages.length === 0) {
    return {
      status: 'unavailable',
      issues: []
    };
  }

  return {
    status: 'invalid',
    issues: messages.map((message, index) => ({
      code: `EDITOR_MESSAGE_${index + 1}`,
      message,
      severity: 'error',
      line: null,
      column: null
    }))
  };
}

export async function probeFormulaEditorViaDom(input: {
  page: BrowserPage;
  inspection: PilotBundleInspection;
  expectedSource: string;
  targetUrl: string;
}): Promise<FormulaProbeRun> {
  if (!input.page.evaluate) {
    throw createFormulaProbeUnavailableError();
  }

  const snapshot = await input.page.evaluate(
    ({ expectedSource }) => {
      const normalize = (value: string) => value
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .trim();

      const selectorCandidates = [
        'textarea',
        '.monaco-editor textarea',
        '.monaco-editor .view-lines',
        '.monaco-editor .view-line',
        '[role="textbox"]',
        '[class*="formula"]',
        '[data-testid*="formula"]'
      ];
      const issueSelectors = [
        '.marker-widget',
        '.monaco-editor [class*="squiggly"]',
        '[role="alert"]',
        '.sapMMsgStrip',
        '.sapMMessageStrip'
      ];

      const seenEditorValues = new Set<string>();
      const editorCandidates: Array<{ selector: string; value: string; visible: boolean }> = [];
      for (const selector of selectorCandidates) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const rawValue = typeof (element as { value?: unknown }).value === 'string'
            ? String((element as { value?: unknown }).value)
            : (element.textContent ?? '');
          const value = normalize(rawValue);
          if (!value) {
            continue;
          }

          const key = `${selector}\u0000${value}`;
          if (seenEditorValues.has(key)) {
            continue;
          }
          seenEditorValues.add(key);
          const computedStyle = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visible = computedStyle.display !== 'none'
            && computedStyle.visibility !== 'hidden'
            && Number(computedStyle.opacity || '1') > 0
            && rect.width > 0
            && rect.height > 0;
          editorCandidates.push({ selector, value, visible });
        }
      }

      const seenIssues = new Set<string>();
      const validationMessages: string[] = [];
      for (const selector of issueSelectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const message = normalize(element.textContent ?? '');
          if (!message || seenIssues.has(message)) {
            continue;
          }
          seenIssues.add(message);
          validationMessages.push(message);
        }
      }

      return {
        currentUrl: window.location.href,
        title: document.title,
        expectedSource: normalize(expectedSource),
        editorCandidates,
        validationMessages
      };
    },
    { expectedSource: input.expectedSource }
  );

  const bestCandidate = selectBestEditorCandidate(snapshot.editorCandidates, snapshot.expectedSource);
  if (!bestCandidate) {
    throw createFormulaReadbackFailedError();
  }

  const reopenedRoute = new URL(snapshot.currentUrl).hash;
  const targetRoute = new URL(input.targetUrl).hash;
  if (reopenedRoute !== targetRoute) {
    throw createFormulaEditorRouteMismatchError(input.targetUrl, snapshot.currentUrl);
  }

  return {
    reopenedUrl: snapshot.currentUrl,
    readbackText: bestCandidate.value,
    selectorUsed: bestCandidate.selector,
    validation: createValidationResult(snapshot.validationMessages),
    raw: {
      title: snapshot.title,
      editorCandidateCount: snapshot.editorCandidates.length,
      validationMessageCount: snapshot.validationMessages.length
    }
  };
}

async function readProofStepSource(inspection: PilotBundleInspection): Promise<{ stepKey: string; stepName: string; source: string }> {
  const proofStep = inspection.dataAction.steps.find(
    (step) => inspection.deploymentState.dataAction.stepIds[step.key] === inspection.proofInputs.dataAction.stepId
  );
  if (!proofStep) {
    throw new CliError(
      'PILOT_BUNDLE_INVALID',
      `Pilot bundle is invalid: proof step id "${inspection.proofInputs.dataAction.stepId}" could not be resolved.`,
      ExitCode.InvalidInput
    );
  }

  if (proofStep.name !== inspection.proofInputs.dataAction.stepName) {
    throw new CliError(
      'PILOT_BUNDLE_INVALID',
      `Pilot bundle is invalid: proof step id "${inspection.proofInputs.dataAction.stepId}" resolved to step "${proofStep.name}", expected "${inspection.proofInputs.dataAction.stepName}".`,
      ExitCode.InvalidInput
    );
  }

  const source = await readFile(path.join(inspection.bundleRoot, proofStep.file), 'utf8');
  return {
    stepKey: proofStep.key,
    stepName: proofStep.name,
    source
  };
}

function normalizeObservedRun(input: {
  inspection: PilotBundleInspection;
  stepKey: string;
  stepName: string;
  expectedSource: string;
  probeRun: FormulaProbeRun;
}): NormalizedReadback {
  const expectedNormalized = normalizeFormulaSource(input.expectedSource);
  const observedNormalized = normalizeFormulaSource(input.probeRun.readbackText);

  return {
    mode: 'non-mutating',
    formula: {
      dataActionKey: input.inspection.dataAction.key,
      dataActionObjectName: input.inspection.proofInputs.dataAction.objectName,
      stepKey: input.stepKey,
      stepName: input.stepName,
      stepId: input.inspection.proofInputs.dataAction.stepId
    },
    comparison: {
      matchesFrozenSource: observedNormalized === expectedNormalized,
      expectedSourceHash: sha256(expectedNormalized),
      readbackSourceHash: sha256(observedNormalized)
    },
    readback: {
      selectorUsed: input.probeRun.selectorUsed,
      normalizedSource: observedNormalized
    },
    validation: input.probeRun.validation,
    validationSource: 'dom-fallback'
  };
}

async function observeFormulaRun(input: {
  inspection: PilotBundleInspection;
  profile: SacCliProfile;
  expectedSource: string;
  stepKey: string;
  stepName: string;
  targetUrl: string;
  probe: FormulaBrowserProbe;
  sessionFactory: (profile: SacCliProfile) => Promise<ManagedBrowserSession>;
  screenshotPath?: string;
}): Promise<ObservedRun> {
  const session = await input.sessionFactory(input.profile);

  try {
    await session.page.goto(input.targetUrl, { waitUntil: 'domcontentloaded' });

    let probeRun: FormulaProbeRun | null = null;
    let lastProbeError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        probeRun = await input.probe({
          page: session.page,
          inspection: input.inspection,
          expectedSource: input.expectedSource,
          targetUrl: input.targetUrl
        });
        break;
      } catch (error) {
        lastProbeError = error;
        if (!(error instanceof CliError) || error.code !== 'FORMULA_READBACK_FAILED' || attempt === 3) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (!probeRun) {
      throw lastProbeError instanceof Error ? lastProbeError : createFormulaReadbackFailedError();
    }

    if (input.screenshotPath) {
      await session.takeScreenshot(input.screenshotPath);
    }

    const normalized = normalizeObservedRun({
      inspection: input.inspection,
      stepKey: input.stepKey,
      stepName: input.stepName,
      expectedSource: input.expectedSource,
      probeRun
    });

    return {
      reopenedUrl: probeRun.reopenedUrl,
      normalized,
      normalizedHash: sha256(stableStringify(normalized)),
      validation: probeRun.validation
    };
  } finally {
    await session.close();
  }
}

async function writeStableArtifact(filePath: string, content: string): Promise<string> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${content.endsWith('\n') ? content : `${content}\n`}`, 'utf8');
  return filePath;
}

async function assertManifestArtifactsExist(evidenceDir: string, inspection: PilotBundleInspection): Promise<void> {
  await Promise.all(
    inspection.evidenceManifest.requiredArtifacts.map(async (relativeArtifact) => {
      await access(path.join(evidenceDir, relativeArtifact));
    })
  );
}

export async function verifyPilotFormula(
  input: VerifyPilotFormulaInput = {},
  deps: VerifyPilotDependencies = {}
): Promise<{ status: 'readback-stable'; mode: 'non-mutating'; profile: string; bundleRoot: string; evidenceDir: string; bundleFingerprint: string; normalizedHash: string; matchesFrozenSource: boolean; validationStatus: FormulaValidationResult['status']; validationSource: 'dom-fallback'; repeatabilityStable: true; artifacts: Record<string, string> }> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const inspection = await inspectPilotBundle(projectRoot);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const probe = deps.probe ?? probeFormulaEditorViaDom;
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const evidenceDir = path.resolve(input.evidenceDir ?? path.join(profile.defaultEvidenceDir, 'formula-verify-pilot'));
  const screenshotPath = path.join(evidenceDir, 'screenshots', 'editor.png');
  const targetUrl = buildTargetUrl(profile, inspection.proofInputs.dataAction.route);
  const proofStep = await readProofStepSource(inspection);

  const firstRun = await observeFormulaRun({
    inspection,
    profile,
    expectedSource: proofStep.source,
    stepKey: proofStep.stepKey,
    stepName: proofStep.stepName,
    targetUrl,
    probe,
    sessionFactory,
    screenshotPath
  });
  const secondRun = await observeFormulaRun({
    inspection,
    profile,
    expectedSource: proofStep.source,
    stepKey: proofStep.stepKey,
    stepName: proofStep.stepName,
    targetUrl,
    probe,
    sessionFactory
  });

  const hashes = [firstRun.normalizedHash, secondRun.normalizedHash];
  const repeatabilityStable = hashes.every((hash) => hash === firstRun.normalizedHash);

  const normalizedReadbackArtifact = {
    ...firstRun.normalized,
    normalizedHash: firstRun.normalizedHash
  };
  const validationArtifact = {
    status: firstRun.validation.status,
    issues: firstRun.validation.issues,
    validationSource: 'dom-fallback' as const,
    matchesFrozenSource: firstRun.normalized.comparison.matchesFrozenSource,
    normalizedHash: firstRun.normalizedHash,
    machineReadable: true
  };
  const reopenArtifact = {
    status: 'ok',
    mode: 'non-mutating',
    profile: profile.name,
    bundleFingerprint: inspection.bundleFingerprint,
    pilotTenantBaseUrl: inspection.proofInputs.tenant.baseUrl,
    resolvedTenantUrl: ensureSacAppUrl(profile.tenantUrl),
    targetUrl,
    validationSource: 'dom-fallback' as const,
    target: {
      storyRoute: inspection.proofInputs.story.route,
      dataActionRoute: inspection.proofInputs.dataAction.route,
      dataActionKey: inspection.proofInputs.dataAction.key,
      stepId: inspection.proofInputs.dataAction.stepId,
      stepName: inspection.proofInputs.dataAction.stepName
    },
    runs: [
      {
        index: 1,
        reopenedUrl: firstRun.reopenedUrl,
        normalizedHash: firstRun.normalizedHash
      },
      {
        index: 2,
        reopenedUrl: secondRun.reopenedUrl,
        normalizedHash: secondRun.normalizedHash
      }
    ],
    repeatability: {
      stable: repeatabilityStable,
      stableHash: repeatabilityStable ? firstRun.normalizedHash : null,
      hashes
    }
  };
  const runLog = [
    'command=formula verify-pilot',
    'mode=non-mutating',
    `profile=${profile.name}`,
    `bundleFingerprint=${inspection.bundleFingerprint}`,
    `targetUrl=${targetUrl}`,
    'validationSource=dom-fallback',
    `matchesFrozenSource=${String(firstRun.normalized.comparison.matchesFrozenSource)}`,
    `validationStatus=${firstRun.validation.status}`,
    `repeatabilityStable=${String(repeatabilityStable)}`,
    `normalizedHash=${firstRun.normalizedHash}`
  ].join('\n');

  const artifacts = {
    'normalized-readback.json': await writeStableArtifact(
      path.join(evidenceDir, 'normalized-readback.json'),
      stableStringify(normalizedReadbackArtifact)
    ),
    'validation-result.json': await writeStableArtifact(
      path.join(evidenceDir, 'validation-result.json'),
      stableStringify(validationArtifact)
    ),
    'reopen-check.json': await writeStableArtifact(
      path.join(evidenceDir, 'reopen-check.json'),
      stableStringify(reopenArtifact)
    ),
    'screenshots/editor.png': screenshotPath,
    'run.log': await writeStableArtifact(path.join(evidenceDir, 'run.log'), runLog)
  };

  await assertManifestArtifactsExist(evidenceDir, inspection);

  if (!firstRun.normalized.comparison.matchesFrozenSource) {
    throw createFormulaReadbackMismatchError(evidenceDir);
  }

  if (firstRun.validation.status === 'invalid') {
    throw createFormulaValidationInvalidError(evidenceDir);
  }

  if (!repeatabilityStable) {
    throw createFormulaRepeatabilityFailedError(hashes, evidenceDir);
  }

  return {
    status: 'readback-stable',
    mode: 'non-mutating',
    profile: profile.name,
    bundleRoot: inspection.bundleRoot,
    evidenceDir,
    bundleFingerprint: inspection.bundleFingerprint,
    normalizedHash: firstRun.normalizedHash,
    matchesFrozenSource: firstRun.normalized.comparison.matchesFrozenSource,
    validationStatus: firstRun.validation.status,
    validationSource: 'dom-fallback',
    repeatabilityStable: true,
    artifacts
  };
}
