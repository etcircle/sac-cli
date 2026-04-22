import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { workflowCaptureSchema, type WorkflowCapture } from '../../src/capture/types.js';
import {
  patchDataActionValidateCapture,
  patchDataActionValidateRequest
} from '../../src/replay/payload-patchers.js';
import { diffWorkflowCapture } from '../../src/replay/diff.js';
import { readObjectMgrValidateRequestFixture } from '../helpers/objectmgr-fixtures.js';

const capturePath = new URL('../../fixtures/redacted/dataaction.validate/capture.json', import.meta.url);

type ValidateSequenceInput = {
  scope: string;
  sequenceMetadata: {
    version: string;
    defaultCubeId: string;
    encounteredVersionLimit: boolean;
    planningSteps: Array<Record<string, unknown>>;
    parameters?: Array<Record<string, unknown>>;
  };
  sequenceId?: string;
  loadScriptContents?: boolean;
  bDefaultCubeChanged?: boolean;
};

async function readCapture(): Promise<WorkflowCapture> {
  const raw = await readFile(capturePath, 'utf8');
  return workflowCaptureSchema.parse(JSON.parse(raw));
}

function readValidateInput(capture: WorkflowCapture): ValidateSequenceInput {
  const requestBody = capture.request.body;
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Expected captured request body to be an object.');
  }

  const data = (requestBody as { data?: unknown }).data;
  if (!Array.isArray(data) || !Array.isArray(data[2]) || data[2].length === 0) {
    throw new Error('Expected captured validate payload data[2][0].');
  }

  const firstInput = data[2][0];
  if (!firstInput || typeof firstInput !== 'object' || Array.isArray(firstInput)) {
    throw new Error('Expected captured validate payload first input to be an object.');
  }

  return firstInput as ValidateSequenceInput;
}

describe('replay diff tooling', () => {
  it('patches only the target step scriptContent and preserves sibling steps, parameters, and flags', async () => {
    const capture = await readCapture();
    const firstInput = readValidateInput(capture);
    const targetStep = firstInput.sequenceMetadata.planningSteps[0];
    const patchedScript = 'CONFIG.GENERATE_UNBOOKED_DATA = OFF\nDATA() = RESULTLOOKUP();';

    const patchedCapture = patchDataActionValidateCapture(capture, {
      stepId: String(targetStep.id),
      scriptContent: patchedScript
    });
    const patchedRequest = patchDataActionValidateRequest(capture.request.body as never, {
      stepId: String(targetStep.id),
      scriptContent: patchedScript
    });
    const patchedFirstInput = readValidateInput(patchedCapture);

    expect(patchedCapture.request.body).toEqual(patchedRequest);
    expect(patchedFirstInput.sequenceMetadata.planningSteps).toHaveLength(2);
    expect(patchedFirstInput.sequenceMetadata.planningSteps[0]).toMatchObject({
      id: targetStep.id,
      scriptContent: patchedScript,
      visualContent: { source: 'captured-target-step' }
    });
    expect(patchedFirstInput.sequenceMetadata.planningSteps[1]).toEqual(
      firstInput.sequenceMetadata.planningSteps[1]
    );
    expect(patchedFirstInput.sequenceMetadata.parameters).toEqual(firstInput.sequenceMetadata.parameters);
    expect(patchedFirstInput.sequenceId).toBe(firstInput.sequenceId);
    expect(patchedFirstInput.loadScriptContents).toBe(false);
    expect(patchedFirstInput.bDefaultCubeChanged).toBe(false);
  });

  it('does not bless whole-object replacement as a surgical patch', async () => {
    const capture = await readCapture();
    const firstInput = readValidateInput(capture);
    const brokenCapture: WorkflowCapture = {
      ...capture,
      request: {
        ...capture.request,
        body: {
          ...(capture.request.body as Record<string, unknown>),
          data: [
            'PLANNINGSEQUENCE',
            'validate',
            [
              {
                ...(firstInput as Record<string, unknown>),
                sequenceMetadata: {
                  ...firstInput.sequenceMetadata,
                  planningSteps: ['BROKEN']
                }
              }
            ]
          ]
        } as WorkflowCapture['request']['body']
      }
    };

    const diff = diffWorkflowCapture(capture, brokenCapture);

    expect(diff.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.request.body.data[2][0].sequenceMetadata.planningSteps[0]',
          classification: 'stable-regression'
        })
      ])
    );
    expect(diff.counts.patch).toBe(0);
  });

  it('reports exactly one declared patch path and no stable regressions for captured-vs-patched replay', async () => {
    const capture = await readCapture();
    const firstInput = readValidateInput(capture);
    const patchedCapture = patchDataActionValidateCapture(capture, {
      stepId: String(firstInput.sequenceMetadata.planningSteps[0].id),
      scriptContent: 'PATCHED SCRIPT CONTENT'
    });

    const diff = diffWorkflowCapture(capture, patchedCapture);

    expect(diff.entries).toHaveLength(1);
    expect(diff.entries).toEqual([
      expect.objectContaining({
        path: '$.request.body.data[2][0].sequenceMetadata.planningSteps[0].scriptContent',
        kind: 'changed',
        classification: 'patch'
      })
    ]);
    expect(diff.counts.patch).toBe(1);
    expect(diff.counts['stable-regression']).toBe(0);
    expect(diff.counts['unexpected-removal']).toBe(0);
    expect(diff.counts['unexpected-addition']).toBe(0);
    expect(diff.counts['unexpected-change']).toBe(0);
  });

  it('flags stable regressions and unexpected removals when the historical synthetic minimal payload replaces the captured request', async () => {
    const capture = await readCapture();
    const syntheticRequest = await readObjectMgrValidateRequestFixture();
    const syntheticCapture: WorkflowCapture = {
      ...capture,
      request: {
        ...capture.request,
        body: syntheticRequest
      }
    };

    const diff = diffWorkflowCapture(capture, syntheticCapture);
    const byClassification = diff.entries.reduce<Record<string, typeof diff.entries>>((groups, entry) => {
      groups[entry.classification] ??= [];
      groups[entry.classification].push(entry);
      return groups;
    }, {});

    expect(diff.counts['stable-regression']).toBeGreaterThan(0);
    expect(diff.counts['unexpected-removal']).toBeGreaterThan(0);
    expect(byClassification['stable-regression']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.request.body.data[2][0].sequenceMetadata.parameters',
          kind: 'removed'
        })
      ])
    );
    expect(byClassification['unexpected-removal']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.request.body.data[2][0].sequenceMetadata.planningSteps[1]',
          kind: 'removed'
        }),
        expect.objectContaining({
          path: '$.request.body.data[2][0].sequenceId',
          kind: 'removed'
        })
      ])
    );
  });
});
