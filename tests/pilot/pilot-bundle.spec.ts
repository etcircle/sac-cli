import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectPilotBundle } from '../../src/pilot/bundle.js';
import { ExitCode } from '../../src/app/exit-codes.js';

async function writePilotBundle(root: string, options: { includeStepFile?: boolean } = {}): Promise<string> {
  const bundleRoot = path.join(root, 'pilot');
  await mkdir(path.join(bundleRoot, 'steps'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'widgets'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'evidence'), { recursive: true });

  await writeFile(
    path.join(bundleRoot, 'proof-inputs.yaml'),
    `tenant:\n  baseUrl: https://decisioninc-1.eu10.hcs.cloud.sap\n  tenantId: J\n  profile: sandbox\nsources:\n  handoff: /tmp/handoffs/sac-agent-handover-2026-04-15.md\n  reconFolder: /tmp/handoffs/sac-api-recon-2026-04-15_143009\n  storyCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/story-edit.json\n  dataActionCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/data-action-edit.json\nstory:\n  key: forecast-story\n  name: POC - C_REPORTING forecast table\n  resourceId: 6441DE864495C73F5BCA84DEF179F641\n  route: '#/story2&/s2/6441DE864495C73F5BCA84DEF179F641/?type=CANVAS&mode=edit'\n  folderPath: My Files / My Playground\ndataAction:\n  key: fx-translation\n  displayName: C_REP_DA008\n  objectType: PLANNINGSEQUENCE\n  package: t.J\n  objectName: FA9020524E79E7C812C4D1E8D41355B\n  route: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'\n  stepId: 39357048-8119-4677-3365-911086985863\n  stepName: FX_TRANS\n  defaultModelId: C9dksk0o57hlt1jra87he2vh67\n`,
    'utf8'
  );

  await writeFile(
    path.join(bundleRoot, 'data-action.yaml'),
    `key: fx-translation\ndisplayName: C_REP_DA008\ndescription: FX Translation - DI Consol\ndefaultModel:\n  id: C9dksk0o57hlt1jra87he2vh67\n  name: C_REPORTING\nsteps:\n  - key: fx-trans\n    name: FX_TRANS\n    type: advanced-formula\n    sourceStatus: ui-preview-excerpt\n    file: steps/fx_trans.af\n`,
    'utf8'
  );

  await writeFile(
    path.join(bundleRoot, 'story.yaml'),
    `key: forecast-story\nname: POC - C_REPORTING forecast table\nfolderPath: My Files / My Playground\npages:\n  - key: main\n    name: Page_1\n    widgets:\n      - forecast-table\n`,
    'utf8'
  );

  await writeFile(
    path.join(bundleRoot, 'widgets', 'forecast-table.yaml'),
    `key: forecast-table\ntype: planning-table\nstory: forecast-story\npage: main\nmodel:\n  name: C_REPORTING\nrows:\n  - Reporting Account\n  - Company Code - DI Consol\ncolumns:\n  - Audittrail - DI Consol\n  - Date\n  - Measures\nfilters:\n  - dimension: Version\n    value: Forecast\n`,
    'utf8'
  );

  await writeFile(
    path.join(bundleRoot, 'deployment-state.yaml'),
    `tenantBaseUrl: https://decisioninc-1.eu10.hcs.cloud.sap\ndataAction:\n  key: fx-translation\n  objectType: PLANNINGSEQUENCE\n  package: t.J\n  objectName: FA9020524E79E7C812C4D1E8D41355B\n  stepIds:\n    fx-trans: 39357048-8119-4677-3365-911086985863\nstory:\n  key: forecast-story\n  resourceId: 6441DE864495C73F5BCA84DEF179F641\nwidgets:\n  forecast-table:\n    story: forecast-story\n    page: main\n`,
    'utf8'
  );

  await writeFile(
    path.join(bundleRoot, 'evidence', 'manifest.yaml'),
    `requiredArtifacts:\n  - normalized-readback.json\n  - validation-result.json\n  - reopen-check.json\n  - screenshots/editor.png\n  - run.log\nacceptanceChecks:\n  - invalid_formula_regression_shape\n  - two_consecutive_read_back_hash_stability\n  - non_mutation_manifest_fingerprint_and_invocation_ledger\n`,
    'utf8'
  );

  if (options.includeStepFile !== false) {
    await writeFile(
      path.join(bundleRoot, 'steps', 'fx_trans.af'),
      'CONFIG.GENERATE_UNBOOKED_DATA = OFF\nMEMBERSET [d/Measures] = "AMOUNT_YTD"\n',
      'utf8'
    );
  }

  return bundleRoot;
}

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
      `tenant:\n  baseUrl: https://decisioninc-1.eu10.hcs.cloud.sap\n  tenantId: J\nsources:\n  handoff: /tmp/handoffs/sac-agent-handover-2026-04-15.md\n  reconFolder: /tmp/handoffs/sac-api-recon-2026-04-15_143009\n  storyCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/story-edit.json\n  dataActionCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/data-action-edit.json\nstory:\n  key: forecast-story\n  name: POC - C_REPORTING forecast table\n  resourceId: 6441DE864495C73F5BCA84DEF179F641\n  route: '#/story2&/s2/6441DE864495C73F5BCA84DEF179F641/?type=CANVAS&mode=edit'\n  folderPath: My Files / My Playground\ndataAction:\n  key: fx-translation\n  displayName: C_REP_DA008\n  objectType: PLANNINGSEQUENCE\n  package: t.J\n  objectName: FA9020524E79E7C812C4D1E8D41355B\n  route: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'\n  stepId: 39357048-8119-4677-3365-911086985863\n  stepName: NOT_A_REAL_STEP\n  defaultModelId: C9dksk0o57hlt1jra87he2vh67\n`,
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
