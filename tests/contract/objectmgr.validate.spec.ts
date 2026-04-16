import { describe, expect, it, vi } from 'vitest';
import { createObjectMgrClient, type ValidatePlanningSequenceStepRequest } from '../../src/seams/objectmgr/client.js';
import {
  readObjectMgrValidateRequestFixture,
  readObjectMgrValidateResponseFixture
} from '../helpers/objectmgr-fixtures.js';

describe('objectmgr validatePlanningSequenceStep contract', () => {
  it('submits a captured validate payload verbatim and normalizes the response', async () => {
    const expectedRequest = await readObjectMgrValidateRequestFixture() as ValidatePlanningSequenceStepRequest;
    const responseFixture = await readObjectMgrValidateResponseFixture();
    const transport = vi.fn().mockResolvedValue(responseFixture);
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport
    });

    const result = await client.validatePlanningSequenceRequest({
      stepId: '39357048-8119-4677-3365-911086985863',
      request: expectedRequest
    });

    expect(transport).toHaveBeenCalledWith({
      method: 'POST',
      path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/json;charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: expectedRequest
    });
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
      ]
    });
  });

  it('builds the captured validate payload and normalizes the response', async () => {
    const expectedRequest = await readObjectMgrValidateRequestFixture() as ValidatePlanningSequenceStepRequest;
    const responseFixture = await readObjectMgrValidateResponseFixture();
    const transport = vi.fn().mockResolvedValue(responseFixture);
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport
    });

    const [, , [validateInput]] = expectedRequest.data;
    const [expectedStep] = validateInput.sequenceMetadata.planningSteps;
    const result = await client.validatePlanningSequenceStep({
      sequenceVersion: validateInput.sequenceMetadata.version,
      defaultModelId: validateInput.sequenceMetadata.defaultCubeId,
      step: {
        id: expectedStep.id,
        name: expectedStep.name,
        description: expectedStep.description,
        scriptContent: expectedStep.scriptContent
      }
    });

    expect(transport).toHaveBeenCalledWith({
      method: 'POST',
      path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'content-type': 'application/json;charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: expectedRequest
    });
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
      ]
    });
  });

  it('returns a valid status when the target step has no validation issues', async () => {
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport: vi.fn().mockResolvedValue({
        sequenceMessages: {},
        stepMessagesByStepId: {},
        parameterMessagesByScope: {},
        executionConfigurationMessages: {}
      })
    });

    await expect(
      client.validatePlanningSequenceStep({
        sequenceVersion: '2025.19',
        defaultModelId: 'C9dksk0o57hlt1jra87he2vh67',
        step: {
          id: '39357048-8119-4677-3365-911086985863',
          name: 'FX_TRANS',
          description: 'FX Trans Logic',
          scriptContent: 'CONFIG.GENERATE_UNBOOKED_DATA = OFF'
        }
      })
    ).resolves.toEqual({
      status: 'valid',
      issues: []
    });
  });

  it('does not report valid when other validation scopes contain errors', async () => {
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport: vi.fn().mockResolvedValue({
        sequenceMessages: {
          E0200000: [
            {
              line: 0,
              severity: 'E',
              start: 0,
              message: {
                code: 'UPDATED_OTHER_MODEL',
                args: ['C_RATES']
              }
            }
          ]
        },
        stepMessagesByStepId: {
          '39357048-8119-4677-3365-911086985863': {}
        },
        parameterMessagesByScope: {},
        executionConfigurationMessages: {}
      })
    });

    await expect(
      client.validatePlanningSequenceStep({
        sequenceVersion: '2025.19',
        defaultModelId: 'C9dksk0o57hlt1jra87he2vh67',
        step: {
          id: '39357048-8119-4677-3365-911086985863',
          name: 'FX_TRANS',
          description: 'FX Trans Logic',
          scriptContent: 'CONFIG.GENERATE_UNBOOKED_DATA = OFF'
        }
      })
    ).resolves.toEqual({
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
  });

  it('fails loudly when the expected validation fields are missing', async () => {
    const client = createObjectMgrClient({
      tenantId: 'J',
      transport: vi.fn().mockResolvedValue({
        sequenceMessages: {}
      })
    });

    await expect(
      client.validatePlanningSequenceStep({
        sequenceVersion: '2025.19',
        defaultModelId: 'C9dksk0o57hlt1jra87he2vh67',
        step: {
          id: '39357048-8119-4677-3365-911086985863',
          name: 'FX_TRANS',
          description: 'FX Trans Logic',
          scriptContent: 'CONFIG.GENERATE_UNBOOKED_DATA = OFF'
        }
      })
    ).rejects.toThrow(/stepMessagesByStepId/);
  });
});
