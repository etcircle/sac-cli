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
  ensureSacAppShell,
  ensureSacAppUrl,
  openManagedBrowserSession,
  openSacRoute
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

function normalizeFormulaComparisonSource(source: string): string {
  const normalizedLines = normalizeFormulaSource(source)
    .split('\n')
    .map((line) => line.replace(/\u200b/g, '').trim())
    .filter((line) => {
      if (!line) {
        return false;
      }
      if (line.startsWith('// Captured from the live SAC editor body preview')) {
        return false;
      }
      if (line.startsWith('// This is intentionally marked as a ui-preview-excerpt')) {
        return false;
      }
      if (line.startsWith('//')) {
        return false;
      }
      return true;
    });

  const mergedLines: string[] = [];
  for (const line of normalizedLines) {
    if (line.startsWith('AND ') && mergedLines.length > 0) {
      mergedLines[mergedLines.length - 1] = `${mergedLines[mergedLines.length - 1]} ${line}`;
      continue;
    }

    mergedLines.push(line);
  }

  return mergedLines
    .map((line) => line
      .replace(/\s*,\s*/g, ', ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+/g, ' ')
      .replace(/^ELSE\s*\/\/.*$/g, 'ELSE')
      .trim())
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
  return async (profile: SacCliProfile) => openManagedBrowserSession(profile, resolvedRuntime);
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
    '[role="textbox"]',
    'body-innerText'
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
  const meaningfulMessages = messages.filter((message) => {
    const normalized = message.trim();
    return normalized !== 'Message Strip Information' && normalized !== 'Information Message Strip';
  });

  if (meaningfulMessages.length === 0) {
    return {
      status: 'unavailable',
      issues: []
    };
  }

  return {
    status: 'invalid',
    issues: meaningfulMessages.map((message, index) => ({
      code: `EDITOR_MESSAGE_${index + 1}`,
      message,
      severity: 'error',
      line: null,
      column: null
    }))
  };
}

function parseFormulaBodyReadback(bodyText: string): string | null {
  const normalizedBody = String(bodyText).replace(/\r\n/g, '\n');
  const rawLines = normalizedBody.split('\n');
  const cleanedLines = rawLines.map((line) => line.replace(/\u200b/g, '').replace(/[ \t]+$/g, ''));
  const formatIndex = cleanedLines.findIndex((line) => line.trim() === 'Format');
  if (formatIndex < 0) {
    return null;
  }

  const extracted: string[] = [];
  for (let index = formatIndex + 1; index < cleanedLines.length; index += 1) {
    const line = cleanedLines[index]?.trim() ?? '';

    if (!line) {
      continue;
    }

    if (
      line === 'No errors found'
      || line.startsWith('You can hover over functions')
      || line === 'Tracing'
      || line === 'Run'
      || line === 'Settings'
      || line === 'Close'
      || line === 'Expand/Collapse'
      || line === 'Tracepoints'
      || line === 'Watch Area'
      || line.startsWith('Please fix all errors')
      || line.startsWith('The "C_RATES" model was updated')
    ) {
      break;
    }

    if (line.startsWith('//')) {
      continue;
    }

    if (/^\d+$/.test(line)) {
      const nextLine = cleanedLines[index + 1]?.replace(/\u200b/g, '').replace(/[ \t]+$/g, '') ?? '';
      const trimmedNextLine = nextLine.trim();
      if (!trimmedNextLine) {
        continue;
      }
      if (trimmedNextLine.startsWith('//')) {
        index += 1;
        continue;
      }
      extracted.push(nextLine);
      if (trimmedNextLine === 'ENDIF') {
        break;
      }
      index += 1;
      continue;
    }

    extracted.push(cleanedLines[index] ?? '');
    if (line === 'ENDIF') {
      break;
    }
  }

  const candidate = extracted.join('\n').trim();
  return candidate || null;
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

  const probeArg = {
    expectedSource: input.expectedSource,
    editorSelectors: [
      'textarea',
      '.monaco-editor textarea',
      '.monaco-editor .view-lines',
      '.monaco-editor .view-line',
      '[role="textbox"]',
      '[class*="formula"]',
      '[data-testid*="formula"]'
    ],
    issueSelectors: [
      '.marker-widget',
      '.monaco-editor [class*="squiggly"]',
      '[role="alert"]',
      '.sapMMsgStrip',
      '.sapMMessageStrip'
    ]
  };

  // Keep the browser callback brutally flat. `tsx`/esbuild injects `__name(...)`
  // into nested helpers/lambdas, and Playwright then serializes that into the
  // browser context where `__name` does not exist. No nested helpers here.
  const probeResult = await input.page.evaluate((arg: typeof probeArg) => {
    const seenEditorValues = new Set<string>();
    const editorCandidates: Array<{ selector: string; value: string; visible: boolean }> = [];
    for (const selector of arg.editorSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const rawValue = typeof (el as HTMLTextAreaElement).value === 'string'
          ? String((el as HTMLTextAreaElement).value)
          : (el.textContent || '');
        const normalizedRawLines = String(rawValue).replace(/\r\n/g, '\n').split('\n');
        const trimmedRawLines: string[] = [];
        for (const line of normalizedRawLines) {
          trimmedRawLines.push(line.replace(/[ \t]+$/g, ''));
        }
        const value = trimmedRawLines.join('\n').trim();
        if (!value) continue;

        const key = selector + '\0' + value;
        if (seenEditorValues.has(key)) continue;
        seenEditorValues.add(key);

        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const visible = cs.display !== 'none'
          && cs.visibility !== 'hidden'
          && Number(cs.opacity || '1') > 0
          && rect.width > 0
          && rect.height > 0;
        editorCandidates.push({ selector, value, visible });
      }
    }

    const seenIssues = new Set<string>();
    const validationMessages: string[] = [];
    for (const selector of arg.issueSelectors) {
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const normalizedMessageLines = String(el.textContent || '').replace(/\r\n/g, '\n').split('\n');
        const trimmedMessageLines: string[] = [];
        for (const line of normalizedMessageLines) {
          trimmedMessageLines.push(line.replace(/[ \t]+$/g, ''));
        }
        const message = trimmedMessageLines.join('\n').trim();
        if (!message || seenIssues.has(message)) continue;
        seenIssues.add(message);
        validationMessages.push(message);
      }
    }

    const normalizedExpectedLines = String(arg.expectedSource).replace(/\r\n/g, '\n').split('\n');
    const trimmedExpectedLines: string[] = [];
    for (const line of normalizedExpectedLines) {
      trimmedExpectedLines.push(line.replace(/[ \t]+$/g, ''));
    }

    return {
      currentUrl: window.location.href,
      title: document.title,
      expectedSource: trimmedExpectedLines.join('\n').trim(),
      editorCandidates,
      validationMessages,
      bodyText: document.body ? (document.body.innerText || '') : ''
    };
  }, probeArg);

  const bodyReadback = parseFormulaBodyReadback(probeResult.bodyText);
  const bestCandidate = selectBestEditorCandidate(
    bodyReadback
      ? [...probeResult.editorCandidates, { selector: 'body-innerText', value: bodyReadback, visible: true }]
      : probeResult.editorCandidates,
    probeResult.expectedSource
  );
  if (!bestCandidate) {
    throw createFormulaReadbackFailedError();
  }

  const reopenedRoute = new URL(probeResult.currentUrl).hash;
  const targetRoute = new URL(input.targetUrl).hash;
  if (reopenedRoute !== targetRoute) {
    throw createFormulaEditorRouteMismatchError(input.targetUrl, probeResult.currentUrl);
  }

  return {
    reopenedUrl: probeResult.currentUrl,
    readbackText: bestCandidate.value,
    selectorUsed: bestCandidate.selector,
    validation: createValidationResult(probeResult.validationMessages),
    raw: {
      title: probeResult.title,
      editorCandidateCount: probeResult.editorCandidates.length,
      validationMessageCount: probeResult.validationMessages.length
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
  const expectedNormalized = normalizeFormulaComparisonSource(input.expectedSource);
  const observedNormalized = normalizeFormulaComparisonSource(input.probeRun.readbackText);

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
  session: ManagedBrowserSession;
  screenshotPath?: string;
}): Promise<ObservedRun> {
  await openSacRoute(input.session.page, input.targetUrl);

  let probeRun: FormulaProbeRun | null = null;
  let lastProbeError: unknown;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      probeRun = await input.probe({
        page: input.session.page,
        inspection: input.inspection,
        expectedSource: input.expectedSource,
        targetUrl: input.targetUrl
      });
      break;
    } catch (error) {
      lastProbeError = error;
      if (!(error instanceof CliError) || error.code !== 'FORMULA_READBACK_FAILED' || attempt === 23) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!probeRun) {
    throw lastProbeError instanceof Error ? lastProbeError : createFormulaReadbackFailedError();
  }

  if (input.screenshotPath) {
    await input.session.takeScreenshot(input.screenshotPath);
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

  const session = await sessionFactory(profile);

  let firstRun: ObservedRun;
  let secondRun: ObservedRun;

  try {
    await ensureSacAppShell(session.page, profile.tenantUrl);

    firstRun = await observeFormulaRun({
      inspection,
      profile,
      expectedSource: proofStep.source,
      stepKey: proofStep.stepKey,
      stepName: proofStep.stepName,
      targetUrl,
      probe,
      session,
      screenshotPath
    });
    secondRun = await observeFormulaRun({
      inspection,
      profile,
      expectedSource: proofStep.source,
      stepKey: proofStep.stepKey,
      stepName: proofStep.stepName,
      targetUrl,
      probe,
      session
    });
  } finally {
    await session.close();
  }

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
