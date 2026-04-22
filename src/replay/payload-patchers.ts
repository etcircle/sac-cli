import type { WorkflowCapture } from '../capture/types.js';
import type { ValidatePlanningSequenceRequest } from '../seams/objectmgr/client.js';

export type DataActionValidatePatchInput = {
  stepId: string;
  scriptContent: string;
};

export type CapturedDataActionValidateRequest = ValidatePlanningSequenceRequest & {
  action: 'callFunction';
  data: ['PLANNINGSEQUENCE', 'validate', [Record<string, unknown>, ...unknown[]]];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function patchDataActionValidateRequest(
  request: CapturedDataActionValidateRequest,
  input: DataActionValidatePatchInput
): CapturedDataActionValidateRequest {
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

export function patchDataActionValidateCapture(
  capture: WorkflowCapture,
  input: DataActionValidatePatchInput
): WorkflowCapture {
  const requestBody = capture.request.body;

  if (
    !isRecord(requestBody)
    || requestBody.action !== 'callFunction'
    || !Array.isArray(requestBody.data)
    || requestBody.data[0] !== 'PLANNINGSEQUENCE'
    || requestBody.data[1] !== 'validate'
  ) {
    throw new Error('Workflow capture request body is not a captured SAC validate payload.');
  }

  return {
    ...capture,
    request: {
      ...capture.request,
      body: patchDataActionValidateRequest(
        requestBody as CapturedDataActionValidateRequest,
        input
      ) as WorkflowCapture['request']['body']
    }
  };
}
