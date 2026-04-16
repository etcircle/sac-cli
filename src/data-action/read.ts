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
import { readSacRuntimeContext } from '../session/page-fetch.js';
import {
  createObjectMgrClient,
  type PlanningSequenceSummary
} from '../seams/objectmgr/client.js';

export type ReadDataActionInput = {
  projectRoot?: string;
  profileName?: string;
};

export type ObjectMgrClientFactory = (input: {
  tenantId: string;
  csrfToken?: string | null;
  page: BrowserPage;
  tenantUrl: string;
}) => ReturnType<typeof createObjectMgrClient>;

export type DataActionReadDependencies = {
  paths?: ConfigPaths;
  store?: ProfileStore;
  runtime?: BrowserRuntime;
  sessionFactory?: (profile: SacCliProfile) => Promise<ManagedBrowserSession>;
  objectMgrFactory?: ObjectMgrClientFactory;
};

async function createSessionFactory(
  runtime?: BrowserRuntime
): Promise<(profile: SacCliProfile) => Promise<ManagedBrowserSession>> {
  const resolvedRuntime = runtime ?? await createDefaultBrowserRuntime();
  return async (profile: SacCliProfile) => launchPersistentBrowserSession(profile, resolvedRuntime);
}

function createDefaultObjectMgrFactory(): ObjectMgrClientFactory {
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

async function readLivePlanningSequence(
  input: ReadDataActionInput,
  deps: DataActionReadDependencies,
  inspection: PilotBundleInspection
) {
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const objectMgrFactory = deps.objectMgrFactory ?? createDefaultObjectMgrFactory();
  const session = await sessionFactory(profile);

  try {
    const targetUrl = buildTargetUrl(profile, inspection.proofInputs.dataAction.route);
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
    const live = await objectMgr.readPlanningSequence({
      objectName: inspection.proofInputs.dataAction.objectName,
      package: inspection.proofInputs.dataAction.package
    });

    return {
      profile,
      live
    };
  } finally {
    await session.close();
  }
}

export async function readDataAction(
  input: ReadDataActionInput = {},
  deps: DataActionReadDependencies = {}
): Promise<{
  status: 'ok';
  profile: string;
  bundleRoot: string;
  resolvedTenantUrl: string;
  bundle: {
    key: string;
    displayName: string;
    description: string;
    objectType: 'PLANNINGSEQUENCE';
    package: string;
    objectName: string;
    defaultModel: {
      id: string;
      name: string;
    };
    proofStep: {
      key: string;
      name: string;
      file: string;
      sourceStatus: 'ui-preview-excerpt' | 'readback-pulled' | 'planned-seed';
    };
    stepCount: number;
  };
  deployment: {
    tenantBaseUrl: string;
    key: string;
    objectType: 'PLANNINGSEQUENCE';
    package: string;
    objectName: string;
    stepIds: Record<string, string>;
  };
  live: PlanningSequenceSummary;
}> {
  const inspection = await inspectPilotBundle(input.projectRoot ?? process.cwd());
  const proofStep = resolveProofStep(inspection);
  const { profile, live } = await readLivePlanningSequence(input, deps, inspection);

  return {
    status: 'ok',
    profile: profile.name,
    bundleRoot: inspection.bundleRoot,
    resolvedTenantUrl: ensureSacAppUrl(profile.tenantUrl),
    bundle: {
      key: inspection.dataAction.key,
      displayName: inspection.dataAction.displayName,
      description: inspection.dataAction.description,
      objectType: inspection.proofInputs.dataAction.objectType,
      package: inspection.proofInputs.dataAction.package,
      objectName: inspection.proofInputs.dataAction.objectName,
      defaultModel: inspection.dataAction.defaultModel,
      proofStep: {
        key: proofStep.key,
        name: proofStep.name,
        file: proofStep.file,
        sourceStatus: proofStep.sourceStatus
      },
      stepCount: inspection.dataAction.steps.length
    },
    deployment: {
      tenantBaseUrl: inspection.deploymentState.tenantBaseUrl,
      key: inspection.deploymentState.dataAction.key,
      objectType: inspection.deploymentState.dataAction.objectType,
      package: inspection.deploymentState.dataAction.package,
      objectName: inspection.deploymentState.dataAction.objectName,
      stepIds: inspection.deploymentState.dataAction.stepIds
    },
    live
  };
}

export async function readDataActionSteps(
  input: ReadDataActionInput = {},
  deps: DataActionReadDependencies = {}
): Promise<{
  status: 'ok';
  profile: string;
  bundleRoot: string;
  resolvedTenantUrl: string;
  live: {
    id: {
      type: 'PLANNINGSEQUENCE';
      name: string;
      package: string;
    };
    version: number;
    active: boolean;
  };
  steps: Array<{
    index: number;
    key: string;
    name: string;
    type: 'advanced-formula';
    sourceStatus: 'ui-preview-excerpt' | 'readback-pulled' | 'planned-seed';
    file: string;
    deployment: {
      stepId: string;
    };
    isProofStep: boolean;
  }>;
}> {
  const inspection = await inspectPilotBundle(input.projectRoot ?? process.cwd());
  const { profile, live } = await readLivePlanningSequence(input, deps, inspection);

  return {
    status: 'ok',
    profile: profile.name,
    bundleRoot: inspection.bundleRoot,
    resolvedTenantUrl: ensureSacAppUrl(profile.tenantUrl),
    live: {
      id: live.id,
      version: live.version,
      active: live.active
    },
    steps: inspection.dataAction.steps.map((step, index) => ({
      index: index + 1,
      key: step.key,
      name: step.name,
      type: step.type,
      sourceStatus: step.sourceStatus,
      file: step.file,
      deployment: {
        stepId: inspection.deploymentState.dataAction.stepIds[step.key]
      },
      isProofStep: inspection.deploymentState.dataAction.stepIds[step.key] === inspection.proofInputs.dataAction.stepId
    }))
  };
}
