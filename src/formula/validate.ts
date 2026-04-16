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
  launchPersistentBrowserSession
} from '../session/browser-session.js';
import { readSacRuntimeContext } from '../session/page-fetch.js';
import { createObjectMgrClient } from '../seams/objectmgr/client.js';
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
  return async (profile: SacCliProfile) => launchPersistentBrowserSession(profile, resolvedRuntime);
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

type CapturedValidatePlanningSequenceRequest = {
  action: 'callFunction';
  data: ['PLANNINGSEQUENCE', 'validate', [Record<string, unknown>, ...unknown[]]];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCapturedValidateRequest(
  request: BrowserRequest,
  expectedStepId: string
): CapturedValidatePlanningSequenceRequest | null {
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

  return parsed as CapturedValidatePlanningSequenceRequest;
}

async function waitForCapturedValidateRequest(
  page: BrowserPage,
  expectedStepId: string,
  timeoutMs: number
): Promise<CapturedValidatePlanningSequenceRequest | null> {
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

function patchCapturedValidateRequest(
  request: CapturedValidatePlanningSequenceRequest,
  input: { stepId: string; scriptContent: string }
): CapturedValidatePlanningSequenceRequest {
  const validationInputs = request.data[2];
  const [firstInput, ...remainingInputs] = validationInputs;
  const sequenceMetadata = firstInput.sequenceMetadata;

  if (!isRecord(sequenceMetadata) || !Array.isArray(sequenceMetadata.planningSteps)) {
    throw new Error('Captured SAC validate payload is missing sequenceMetadata.planningSteps.');
  }

  let replaced = false;
  const planningSteps = sequenceMetadata.planningSteps.map((step) => {
    if (!isRecord(step) || step.id !== input.stepId) {
      return step;
    }

    replaced = true;
    return {
      ...step,
      scriptContent: input.scriptContent
    };
  });

  if (!replaced) {
    throw new Error(`Captured SAC validate payload is missing the target step "${input.stepId}".`);
  }

  return {
    ...request,
    data: [
      request.data[0],
      request.data[1],
      [
        {
          ...firstInput,
          sequenceMetadata: {
            ...sequenceMetadata,
            planningSteps
          }
        },
        ...remainingInputs
      ]
    ]
  };
}

export async function validatePilotFormula(
  input: ValidatePilotFormulaInput = {},
  deps: ValidatePilotDependencies = {}
): Promise<FormulaValidationResult & {
  validationSource: 'objectmgr';
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

    await session.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
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
    const validation = capturedValidateRequest
      ? await objectMgr.validatePlanningSequenceRequest({
          stepId: inspection.proofInputs.dataAction.stepId,
          request: patchCapturedValidateRequest(capturedValidateRequest, {
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
