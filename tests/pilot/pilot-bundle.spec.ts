import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectPilotBundle } from '../../src/pilot/bundle.js';
import { ExitCode } from '../../src/app/exit-codes.js';
import { PILOT_BASE_URL, writePilotBundle } from '../helpers/pilot-bundle.js';

describe('pilot bundle inspection', () => {
  it('loads the checked-in pilot bundle from the repo root', async () => {
    const inspection = await inspectPilotBundle(process.cwd());

    expect(inspection.story.key).toBe('forecast-story');
    expect(inspection.dataAction.key).toBe('fx-translation');
    expect(inspection.widgets.map((widget) => widget.key)).toEqual(['forecast-table']);
  });

  it('loads the frozen proof inputs and computes stable fingerprints', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-pilot-'));
    const bundleRoot = await writePilotBundle(root);

    const inspection = await inspectPilotBundle(root);

    expect(inspection.bundleRoot).toBe(bundleRoot);
    expect(inspection.proofInputs.story.resourceId).toBe('6441DE864495C73F5BCA84DEF179F641');
    expect(inspection.dataAction.steps).toHaveLength(1);
    expect(inspection.widgets.map((widget) => widget.key)).toEqual(['forecast-table']);
    expect(inspection.acceptanceChecks).toEqual([
      'invalid_formula_regression_shape',
      'two_consecutive_read_back_hash_stability',
      'non_mutation_manifest_fingerprint_and_invocation_ledger'
    ]);
    expect(inspection.fileFingerprints['steps/fx_trans.af']).toMatch(/^[a-f0-9]{64}$/);
    expect(inspection.bundleFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails when a manifest points at a missing advanced formula source file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-pilot-'));
    await writePilotBundle(root, { includeStepFile: false });

    await expect(inspectPilotBundle(root)).rejects.toMatchObject({
      code: 'PILOT_BUNDLE_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Pilot bundle is invalid: data-action step "fx-trans" points to missing file "steps/fx_trans.af".'
    });
  });

  it('fails when proof inputs drift away from the frozen data-action identifiers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-pilot-'));
    const bundleRoot = await writePilotBundle(root);
    await writeFile(
      path.join(bundleRoot, 'proof-inputs.yaml'),
      `tenant:\n  baseUrl: ${PILOT_BASE_URL}\n  tenantId: EXAMPLE\n  profile: pilot-sandbox\nsources:\n  handoff: sac-agent-handover-2026-04-15\n  reconFolder: sac-api-recon-2026-04-15_143009\n  storyCapture: story-edit.json\n  dataActionCapture: data-action-edit.json\nstory:\n  key: forecast-story\n  name: POC - C_REPORTING forecast table\n  resourceId: 6441DE864495C73F5BCA84DEF179F641\n  route: '#/story2&/s2/6441DE864495C73F5BCA84DEF179F641/?type=CANVAS&mode=edit'\n  folderPath: My Files / My Playground\ndataAction:\n  key: fx-translation\n  displayName: C_REP_DA008\n  objectType: PLANNINGSEQUENCE\n  package: t.J\n  objectName: FA9020524E79E7C812C4D1E8D41355B\n  route: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'\n  stepId: 39357048-8119-4677-3365-911086985863\n  stepName: NOT_A_REAL_STEP\n  defaultModelId: C9dksk0o57hlt1jra87he2vh67\n`,
      'utf8'
    );

    await expect(inspectPilotBundle(root)).rejects.toMatchObject({
      code: 'PILOT_BUNDLE_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Pilot bundle is invalid: proof inputs stepName "NOT_A_REAL_STEP" must resolve to exactly one data-action step.'
    });
  });

  it('fails when the story manifest references the same widget more than once', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-pilot-'));
    const bundleRoot = await writePilotBundle(root);
    await writeFile(
      path.join(bundleRoot, 'story.yaml'),
      `key: forecast-story\nname: POC - C_REPORTING forecast table\nfolderPath: My Files / My Playground\npages:\n  - key: main\n    name: Page_1\n    widgets:\n      - forecast-table\n  - key: secondary\n    name: Page_2\n    widgets:\n      - forecast-table\n`,
      'utf8'
    );

    await expect(inspectPilotBundle(root)).rejects.toMatchObject({
      code: 'PILOT_BUNDLE_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Pilot bundle is invalid: story manifest references widget "forecast-table" more than once.'
    });
  });

  it('fails when an unreferenced artifact sneaks into the frozen bundle', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-pilot-'));
    const bundleRoot = await writePilotBundle(root);
    await writeFile(path.join(bundleRoot, 'steps', 'unused.af'), 'CONFIG.GENERATE_UNBOOKED_DATA = OFF\n', 'utf8');

    await expect(inspectPilotBundle(root)).rejects.toMatchObject({
      code: 'PILOT_BUNDLE_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Pilot bundle is invalid: unexpected file(s) in "steps": steps/unused.af.'
    });
  });
});
