import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import { type SacCliProfile } from '../config/schema.js';
import { inspectPilotBundle, type PilotBundleInspection } from '../pilot/bundle.js';
import {
  type BrowserPage,
  type BrowserRequest,
  type BrowserRuntime,
  type ManagedBrowserSession,
  createDefaultBrowserRuntime,
  ensureSacAppUrl,
  openManagedBrowserSession,
  openSacRoute
} from '../session/browser-session.js';
import { readSacRuntimeContext } from '../session/page-fetch.js';
import { createObjectMgrClient } from '../seams/objectmgr/client.js';
import {
  patchDataActionValidateRequest,
  type CapturedDataActionValidateRequest
} from '../replay/payload-patchers.js';
import { type FormulaValidationResult } from './types.js';

export type ValidatePilotFormulaInput = {
  projectRoot?: string;
  profileName?: string;
};

export type FormulaObjectMgrClientFactory = (input: {
  tenantId: string;
  csrfToken?: string | null;
  page: BrowserPage;
  tenantUrl: string;
}) => ReturnType<typeof createObjectMgrClient>;

export type ValidatePilotDependencies = {
  paths?: ConfigPaths;
  store?: ProfileStore;
  runtime?: BrowserRuntime;
  sessionFactory?: (profile: SacCliProfile) => Promise<ManagedBrowserSession>;
  objectMgrFactory?: FormulaObjectMgrClientFactory;
};

async function createSessionFactory(
  runtime?: BrowserRuntime
): Promise<(profile: SacCliProfile) => Promise<ManagedBrowserSession>> {
  const resolvedRuntime = runtime ?? await createDefaultBrowserRuntime();
  return async (profile: SacCliProfile) => openManagedBrowserSession(profile, resolvedRuntime);
}

function createDefaultObjectMgrFactory(): FormulaObjectMgrClientFactory {
  return (input) => createObjectMgrClient(input);
}

function resolveProofStep(inspection: PilotBundleInspection) {
  const proofStep = inspection.dataAction.steps.find(
    (step) => inspection.deploymentState.dataAction.stepIds[step.key] === inspection.proofInputs.dataAction.stepId
  );

  if (!proofStep) {
    throw new Error(`Pilot bundle proof step "${inspection.proofInputs.dataAction.stepId}" could not be resolved.`);
  }

  return proofStep;
}

function buildTargetUrl(profile: SacCliProfile, route: string): string {
  const targetUrl = new URL(ensureSacAppUrl(profile.tenantUrl));
  targetUrl.hash = route.startsWith('#') ? route : `#${route}`;
  return targetUrl.toString();
}

async function readProofStepSource(inspection: PilotBundleInspection): Promise<string> {
  const proofStep = resolveProofStep(inspection);
  return readFile(path.join(inspection.bundleRoot, proofStep.file), 'utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCapturedValidateRequest(
  request: BrowserRequest,
  expectedStepId: string
): CapturedDataActionValidateRequest | null {
  const rawBody = request.postData();
  if (!rawBody) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed.action !== 'callFunction' || !Array.isArray(parsed.data) || parsed.data.length < 3) {
    return null;
  }

  if (parsed.data[0] !== 'PLANNINGSEQUENCE' || parsed.data[1] !== 'validate') {
    return null;
  }

  const validationInputs = parsed.data[2];
  if (!Array.isArray(validationInputs) || validationInputs.length === 0 || !isRecord(validationInputs[0])) {
    return null;
  }

  const sequenceMetadata = validationInputs[0].sequenceMetadata;
  if (!isRecord(sequenceMetadata) || !Array.isArray(sequenceMetadata.planningSteps)) {
    return null;
  }

  const hasTargetStep = sequenceMetadata.planningSteps.some(
    (step) => isRecord(step) && step.id === expectedStepId
  );

  if (!hasTargetStep) {
    return null;
  }

  return parsed as CapturedDataActionValidateRequest;
}

async function waitForCapturedValidateRequest(
  page: BrowserPage,
  expectedStepId: string,
  timeoutMs: number
): Promise<CapturedDataActionValidateRequest | null> {
  if (!page.waitForRequest) {
    return null;
  }

  try {
    const request = await page.waitForRequest(
      (candidate) => parseCapturedValidateRequest(candidate, expectedStepId) !== null,
      { timeout: timeoutMs }
    );
    return parseCapturedValidateRequest(request, expectedStepId);
  } catch {
    return null;
  }
}

export type FormulaValidateRuntimeMode = 'captured-request-replay' | 'single-step-fallback';

export async function validatePilotFormula(
  input: ValidatePilotFormulaInput = {},
  deps: ValidatePilotDependencies = {}
): Promise<FormulaValidationResult & {
  validationSource: 'objectmgr';
  runtimeMode: FormulaValidateRuntimeMode;
  profile: string;
  bundleRoot: string;
  resolvedTenantUrl: string;
  target: {
    dataActionKey: string;
    package: string;
    objectName: string;
    stepKey: string;
    stepName: string;
    stepId: string;
    defaultModelId: string;
  };
}> {
  const inspection = await inspectPilotBundle(input.projectRoot ?? process.cwd());
  const proofStep = resolveProofStep(inspection);
  const stepSource = await readProofStepSource(inspection);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const objectMgrFactory = deps.objectMgrFactory ?? createDefaultObjectMgrFactory();
  const session = await sessionFactory(profile);

  try {
    const targetUrl = buildTargetUrl(profile, inspection.proofInputs.dataAction.route);
    const capturedValidateRequestPromise = waitForCapturedValidateRequest(
      session.page,
      inspection.proofInputs.dataAction.stepId,
      15000
    );

    await openSacRoute(session.page, targetUrl);
    const runtimeContext = await readSacRuntimeContext(session.page, inspection.proofInputs.tenant.tenantId, {
      requireCsrfToken: true,
      timeoutMs: 15000
    });
    const objectMgr = objectMgrFactory({
      tenantId: runtimeContext.tenantId,
      csrfToken: runtimeContext.csrfToken,
      page: session.page,
      tenantUrl: profile.tenantUrl
    });
    const capturedValidateRequest = await capturedValidateRequestPromise;
    const runtimeMode: FormulaValidateRuntimeMode = capturedValidateRequest
      ? 'captured-request-replay'
      : 'single-step-fallback';
    const validation = capturedValidateRequest
      ? await objectMgr.validatePlanningSequenceRequest({
          stepId: inspection.proofInputs.dataAction.stepId,
          request: patchDataActionValidateRequest(capturedValidateRequest, {
            stepId: inspection.proofInputs.dataAction.stepId,
            scriptContent: stepSource
          })
        })
      : await (async () => {
          const live = await objectMgr.readPlanningSequence({
            objectName: inspection.proofInputs.dataAction.objectName,
            package: inspection.proofInputs.dataAction.package
          });
          return objectMgr.validatePlanningSequenceStep({
            sequenceVersion: String(live.version),
            defaultModelId: inspection.proofInputs.dataAction.defaultModelId,
            step: {
              id: inspection.proofInputs.dataAction.stepId,
              name: proofStep.name,
              description: proofStep.description,
              scriptContent: stepSource
            }
          });
        })();

    return {
      ...validation,
      validationSource: 'objectmgr',
      runtimeMode,
      profile: profile.name,
      bundleRoot: inspection.bundleRoot,
      resolvedTenantUrl: ensureSacAppUrl(profile.tenantUrl),
      target: {
        dataActionKey: inspection.dataAction.key,
        package: inspection.proofInputs.dataAction.package,
        objectName: inspection.proofInputs.dataAction.objectName,
        stepKey: proofStep.key,
        stepName: proofStep.name,
        stepId: inspection.proofInputs.dataAction.stepId,
        defaultModelId: inspection.proofInputs.dataAction.defaultModelId
      }
    };
  } finally {
    await session.close();
  }
}
