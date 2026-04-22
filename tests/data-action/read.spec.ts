import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { readDataAction, readDataActionSteps } from '../../src/data-action/read.js';
import { PILOT_PROFILE_NAME, PILOT_RUNTIME_TENANT_URL, writePilotBundle } from '../helpers/pilot-bundle.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-data-action-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

function createSessionFactory(
  goto: ReturnType<typeof vi.fn>,
  close = vi.fn().mockResolvedValue(undefined),
  runtimeContext = { tenantId: 'J', csrfToken: 'csrf-token', tenantDescription: '9AA1C' }
) {
  return async () => ({
    page: {
      goto,
      url: () => `${PILOT_RUNTIME_TENANT_URL}#shell`,
      screenshot: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(runtimeContext)
    },
    context: {
      pages: () => [],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    },
    close,
    takeScreenshot: vi.fn()
  });
}

describe('data-action read services', () => {
  it('returns explicit bundle, deployment, and live sections for data-action get', async () => {
    const homes = await makeIsolatedHomes();
    const bundleRoot = await writePilotBundle(homes.root);
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);
    await store.saveProfile({
      name: PILOT_PROFILE_NAME,
      tenantUrl: PILOT_RUNTIME_TENANT_URL,
      defaultAccount: 'pilot@example.invalid',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir(PILOT_PROFILE_NAME),
      defaultEvidenceDir: paths.evidenceDir(PILOT_PROFILE_NAME)
    });

    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const readPlanningSequence = vi.fn().mockResolvedValue({
      id: {
        type: 'PLANNINGSEQUENCE',
        name: 'FA9020524E79E7C812C4D1E8D41355B',
        package: 't.J'
      },
      description: 'FX Translation - Redacted',
      version: 14,
      active: true,
      createdAt: '2025-02-13T14:35:02.956Z',
      modifiedAt: '2025-05-07T08:11:22.321Z',
      owner: {
        id: 'REDACTED_OWNER',
        displayName: 'Redacted Owner'
      },
      changedBy: {
        id: 'REDACTED_OWNER',
        displayName: 'Redacted Owner'
      },
      resource: {
        sharedToAny: true,
        canShare: true,
        auth: {
          read: true,
          update: true,
          delete: true
        },
        ancestorPath: []
      }
    });
    const objectMgrFactory = vi.fn().mockReturnValue({
      readPlanningSequence,
      validatePlanningSequenceStep: vi.fn()
    });

    const result = await readDataAction(
      {
        projectRoot: homes.root
      },
      {
        paths,
        store,
        sessionFactory: createSessionFactory(goto, close),
        objectMgrFactory
      }
    );

    expect(goto).not.toHaveBeenCalled();
    expect(objectMgrFactory).toHaveBeenCalledWith({
      tenantId: 'J',
      csrfToken: 'csrf-token',
      page: expect.objectContaining({
        goto,
        evaluate: expect.any(Function)
      }),
      tenantUrl: PILOT_RUNTIME_TENANT_URL
    });
    expect(readPlanningSequence).toHaveBeenCalledWith({
      objectName: 'FA9020524E79E7C812C4D1E8D41355B',
      package: 't.J'
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'ok',
      profile: PILOT_PROFILE_NAME,
      bundleRoot,
      resolvedTenantUrl: PILOT_RUNTIME_TENANT_URL,
      bundle: {
        key: 'fx-translation',
        displayName: 'C_REP_DA008',
        description: 'FX Translation - DI Consol',
        objectType: 'PLANNINGSEQUENCE',
        package: 't.J',
        objectName: 'FA9020524E79E7C812C4D1E8D41355B',
        defaultModel: {
          id: 'C9dksk0o57hlt1jra87he2vh67',
          name: 'C_REPORTING'
        },
        proofStep: {
          key: 'fx-trans',
          name: 'FX_TRANS',
          file: 'steps/fx_trans.af',
          sourceStatus: 'ui-preview-excerpt'
        },
        stepCount: 1
      },
      deployment: {
        tenantBaseUrl: 'https://tenant.example.invalid',
        key: 'fx-translation',
        objectType: 'PLANNINGSEQUENCE',
        package: 't.J',
        objectName: 'FA9020524E79E7C812C4D1E8D41355B',
        stepIds: {
          'fx-trans': '39357048-8119-4677-3365-911086985863'
        }
      },
      live: {
        id: {
          type: 'PLANNINGSEQUENCE',
          name: 'FA9020524E79E7C812C4D1E8D41355B',
          package: 't.J'
        },
        description: 'FX Translation - Redacted',
        version: 14,
        active: true,
        createdAt: '2025-02-13T14:35:02.956Z',
        modifiedAt: '2025-05-07T08:11:22.321Z',
        owner: {
          id: 'REDACTED_OWNER',
          displayName: 'Redacted Owner'
        },
        changedBy: {
          id: 'REDACTED_OWNER',
          displayName: 'Redacted Owner'
        },
        resource: {
          sharedToAny: true,
          canShare: true,
          auth: {
            read: true,
            update: true,
            delete: true
          },
          ancestorPath: []
        }
      }
    });
  });

  it('returns ordered step summaries and clearly marks the proof step', async () => {
    const homes = await makeIsolatedHomes();
    await writePilotBundle(homes.root);
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);
    await store.saveProfile({
      name: PILOT_PROFILE_NAME,
      tenantUrl: PILOT_RUNTIME_TENANT_URL,
      defaultAccount: 'pilot@example.invalid',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir(PILOT_PROFILE_NAME),
      defaultEvidenceDir: paths.evidenceDir(PILOT_PROFILE_NAME)
    });

    const objectMgrFactory = vi.fn().mockReturnValue({
      readPlanningSequence: vi.fn().mockResolvedValue({
        id: {
          type: 'PLANNINGSEQUENCE',
          name: 'FA9020524E79E7C812C4D1E8D41355B',
          package: 't.J'
        },
        description: 'FX Translation - Redacted',
        version: 14,
        active: true,
        createdAt: '2025-02-13T14:35:02.956Z',
        modifiedAt: '2025-05-07T08:11:22.321Z',
        owner: {
          id: 'REDACTED_OWNER',
          displayName: 'Redacted Owner'
        },
        changedBy: {
          id: 'REDACTED_OWNER',
          displayName: 'Redacted Owner'
        },
        resource: {
          sharedToAny: true,
          canShare: true,
          auth: {
            read: true,
            update: true,
            delete: true
          },
          ancestorPath: []
        }
      }),
      validatePlanningSequenceStep: vi.fn()
    });

    const result = await readDataActionSteps(
      {
        projectRoot: homes.root
      },
      {
        paths,
        store,
        sessionFactory: createSessionFactory(vi.fn().mockResolvedValue(undefined)),
        objectMgrFactory
      }
    );

    expect(result).toEqual({
      status: 'ok',
      profile: PILOT_PROFILE_NAME,
      bundleRoot: path.join(homes.root, 'pilot'),
      resolvedTenantUrl: PILOT_RUNTIME_TENANT_URL,
      live: {
        id: {
          type: 'PLANNINGSEQUENCE',
          name: 'FA9020524E79E7C812C4D1E8D41355B',
          package: 't.J'
        },
        version: 14,
        active: true
      },
      steps: [
        {
          index: 1,
          key: 'fx-trans',
          name: 'FX_TRANS',
          type: 'advanced-formula',
          sourceStatus: 'ui-preview-excerpt',
          file: 'steps/fx_trans.af',
          deployment: {
            stepId: '39357048-8119-4677-3365-911086985863'
          },
          isProofStep: true
        }
      ]
    });
  });
});
