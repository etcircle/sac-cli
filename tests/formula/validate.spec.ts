import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { validatePilotFormula } from '../../src/formula/validate.js';
import { PILOT_PROFILE_NAME, PILOT_RUNTIME_TENANT_URL, writePilotBundle } from '../helpers/pilot-bundle.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-formula-validate-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

function createSessionFactory(
  goto: ReturnType<typeof vi.fn>,
  close = vi.fn().mockResolvedValue(undefined),
  runtimeContext = { tenantId: 'J', csrfToken: 'csrf-token', tenantDescription: '9AA1C' },
  pageOverrides: Record<string, unknown> = {}
) {
  return async () => ({
    page: {
      goto,
      url: () => `${PILOT_RUNTIME_TENANT_URL}#shell`,
      screenshot: vi.fn(),
      evaluate: vi.fn().mockResolvedValue(runtimeContext),
      ...pageOverrides
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

describe('formula validate service', () => {
  it('reuses the live SAC validate payload so prompt parameter values survive validation', async () => {
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

    const goto = vi.fn().mockResolvedValue(undefined);
    const validatePlanningSequenceRequest = vi.fn().mockResolvedValue({
      status: 'invalid',
      issues: [
        {
          code: 'UPDATED_OTHER_MODEL',
          message: 'UPDATED_OTHER_MODEL: C_RATES',
          severity: 'error',
          line: 0,
          column: 0
        }
      ]
    });
    const waitForRequest = vi.fn().mockResolvedValue({
      url: () => `${PILOT_RUNTIME_TENANT_URL.replace('/sap/fpa/ui/app.html', '')}/sap/fpa/services/rest/epm/objectmgr?tenant=J`,
      postData: () => JSON.stringify({
        action: 'callFunction',
        data: [
          'PLANNINGSEQUENCE',
          'validate',
          [
            {
              scope: 'DESIGNER',
              sequenceMetadata: {
                version: '2025.19',
                defaultCubeId: 'C9dksk0o57hlt1jra87he2vh67',
                encounteredVersionLimit: false,
                planningSteps: [
                  {
                    id: '39357048-8119-4677-3365-911086985863',
                    name: 'FX_TRANS',
                    description: 'FX Trans Logic',
                    stepType: 'SCRIPT',
                    panelType: 'TEXTUAL',
                    scriptContent: 'REMOTE SOURCE',
                    visualContent: { source: 'captured-target-step' }
                  },
                  {
                    id: '23264722-7626-4070-3296-525437926682',
                    name: 'F_CLO',
                    description: 'CLOSING Balances',
                    stepType: 'SCRIPT',
                    panelType: 'TEXTUAL',
                    scriptContent: 'UNCHANGED SECOND STEP'
                  }
                ],
                parameters: [
                  {
                    displayKey: 'TargetCurrency',
                    inputType: 'PROMPT',
                    type: 'MEMBER',
                    cardinality: 'SINGLE',
                    dimensionId: 'C_CURRENCY',
                    value: {
                      memberId: 'USD',
                      hierarchyName: null
                    }
                  }
                ]
              },
              sequenceId: 'PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B',
              loadScriptContents: false,
              bDefaultCubeChanged: false
            }
          ]
        ]
      })
    });
    const objectMgrFactory = vi.fn().mockReturnValue({
      validatePlanningSequenceRequest
    });

    const result = await validatePilotFormula(
      {
        projectRoot: homes.root
      },
      {
        paths,
        store,
        sessionFactory: createSessionFactory(goto, vi.fn().mockResolvedValue(undefined), undefined, { waitForRequest }),
        objectMgrFactory
      }
    );

    expect(waitForRequest).toHaveBeenCalledTimes(1);
    expect(validatePlanningSequenceRequest).toHaveBeenCalledWith({
      stepId: '39357048-8119-4677-3365-911086985863',
      request: {
        action: 'callFunction',
        data: [
          'PLANNINGSEQUENCE',
          'validate',
          [
            {
              scope: 'DESIGNER',
              sequenceMetadata: {
                version: '2025.19',
                defaultCubeId: 'C9dksk0o57hlt1jra87he2vh67',
                encounteredVersionLimit: false,
                planningSteps: [
                  {
                    id: '39357048-8119-4677-3365-911086985863',
                    name: 'FX_TRANS',
                    description: 'FX Trans Logic',
                    stepType: 'SCRIPT',
                    panelType: 'TEXTUAL',
                    scriptContent: expect.stringContaining('CONFIG.GENERATE_UNBOOKED_DATA = OFF'),
                    visualContent: { source: 'captured-target-step' }
                  },
                  {
                    id: '23264722-7626-4070-3296-525437926682',
                    name: 'F_CLO',
                    description: 'CLOSING Balances',
                    stepType: 'SCRIPT',
                    panelType: 'TEXTUAL',
                    scriptContent: 'UNCHANGED SECOND STEP'
                  }
                ],
                parameters: [
                  {
                    displayKey: 'TargetCurrency',
                    inputType: 'PROMPT',
                    type: 'MEMBER',
                    cardinality: 'SINGLE',
                    dimensionId: 'C_CURRENCY',
                    value: {
                      memberId: 'USD',
                      hierarchyName: null
                    }
                  }
                ]
              },
              sequenceId: 'PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B',
              loadScriptContents: false,
              bDefaultCubeChanged: false
            }
          ]
        ]
      }
    });
    expect(result.status).toBe('invalid');
    expect(result.runtimeMode).toBe('captured-request-replay');
    expect(result.issues).toEqual([
      {
        code: 'UPDATED_OTHER_MODEL',
        message: 'UPDATED_OTHER_MODEL: C_RATES',
        severity: 'error',
        line: 0,
        column: 0
      }
    ]);
  });

  it('returns machine-readable objectmgr validation for the frozen pilot step', async () => {
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
    const validatePlanningSequenceStep = vi.fn().mockResolvedValue({
      status: 'invalid',
      issues: [
        {
          code: 'UPDATED_OTHER_MODEL',
          message: 'UPDATED_OTHER_MODEL: C_RATES',
          severity: 'error',
          line: 0,
          column: 0
        }
      ]
    });
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
      validatePlanningSequenceStep
    });

    const result = await validatePilotFormula(
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
    expect(validatePlanningSequenceStep).toHaveBeenCalledWith({
      sequenceVersion: '14',
      defaultModelId: 'C9dksk0o57hlt1jra87he2vh67',
      step: {
        id: '39357048-8119-4677-3365-911086985863',
        name: 'FX_TRANS',
        description: 'FX Trans Logic',
        scriptContent: expect.stringContaining('CONFIG.GENERATE_UNBOOKED_DATA = OFF')
      }
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'invalid',
      issues: [
        {
          code: 'UPDATED_OTHER_MODEL',
          message: 'UPDATED_OTHER_MODEL: C_RATES',
          severity: 'error',
          line: 0,
          column: 0
        }
      ],
      validationSource: 'objectmgr',
      runtimeMode: 'single-step-fallback',
      profile: PILOT_PROFILE_NAME,
      bundleRoot,
      resolvedTenantUrl: PILOT_RUNTIME_TENANT_URL,
      target: {
        dataActionKey: 'fx-translation',
        package: 't.J',
        objectName: 'FA9020524E79E7C812C4D1E8D41355B',
        stepKey: 'fx-trans',
        stepName: 'FX_TRANS',
        stepId: '39357048-8119-4677-3365-911086985863',
        defaultModelId: 'C9dksk0o57hlt1jra87he2vh67'
      }
    });
  });
});
