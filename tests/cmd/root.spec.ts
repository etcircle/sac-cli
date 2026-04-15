import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { mkdir, writeFile } from 'node:fs/promises';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-root-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

async function writePilotBundle(root: string): Promise<string> {
  const bundleRoot = path.join(root, 'pilot');
  await mkdir(path.join(bundleRoot, 'steps'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'widgets'), { recursive: true });
  await mkdir(path.join(bundleRoot, 'evidence'), { recursive: true });

  await writeFile(
    path.join(bundleRoot, 'proof-inputs.yaml'),
    `tenant:\n  baseUrl: https://decisioninc-1.eu10.hcs.cloud.sap\n  tenantId: J\nsources:\n  handoff: /tmp/handoffs/sac-agent-handover-2026-04-15.md\n  reconFolder: /tmp/handoffs/sac-api-recon-2026-04-15_143009\n  storyCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/story-edit.json\n  dataActionCapture: /tmp/handoffs/sac-api-recon-2026-04-15_143009/data-action-edit.json\nstory:\n  key: forecast-story\n  name: POC - C_REPORTING forecast table\n  resourceId: 6441DE864495C73F5BCA84DEF179F641\n  route: '#/story2&/s2/6441DE864495C73F5BCA84DEF179F641/?type=CANVAS&mode=edit'\n  folderPath: My Files / My Playground\ndataAction:\n  key: fx-translation\n  displayName: C_REP_DA008\n  objectType: PLANNINGSEQUENCE\n  package: t.J\n  objectName: FA9020524E79E7C812C4D1E8D41355B\n  route: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'\n  stepId: 39357048-8119-4677-3365-911086985863\n  stepName: FX_TRANS\n  defaultModelId: C9dksk0o57hlt1jra87he2vh67\n`,
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
  await writeFile(
    path.join(bundleRoot, 'steps', 'fx_trans.af'),
    'CONFIG.GENERATE_UNBOOKED_DATA = OFF\nMEMBERSET [d/Measures] = "AMOUNT_YTD"\n',
    'utf8'
  );

  return bundleRoot;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('root CLI', () => {
  it('returns a stable JSON envelope for doctor session before auth is configured', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const result = await runCli(['--json', 'doctor', 'session']);

    expect(result.exitCode).toBe(ExitCode.ProfileRequired);
    expect(result.stdout).not.toBeNull();
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'PROFILE_REQUIRED',
        message: 'A profile is required. Pass --profile, set SAC_CLI_PROFILE, or configure a default profile.',
        exitCode: ExitCode.ProfileRequired
      }
    });
    expect(result.stderr).toBe('');
  });

  it('uses --profile before env/default resolution', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', 'env-profile');

    const store = createProfileStore(createConfigPaths());
    await store.saveProfile({
      name: 'env-profile',
      tenantUrl: 'https://env.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'env@example.invalid',
      browserChannel: 'chrome',
      userDataDir: path.join(homes.dataHome, 'profiles', 'env-profile', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'env-profile', 'evidence')
    });
    await store.saveProfile({
      name: 'flag-profile',
      tenantUrl: 'https://flag.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'flag@example.invalid',
      browserChannel: 'chromium',
      userDataDir: path.join(homes.dataHome, 'profiles', 'flag-profile', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'flag-profile', 'evidence')
    });

    const result = await runCli(['--json', '--profile', 'flag-profile', 'doctor', 'session']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: true,
      data: {
        status: 'ok',
        profile: 'flag-profile'
      }
    });
  });

  it('uses the resolved profile when a sole configured profile exists', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const store = createProfileStore(createConfigPaths());
    await store.saveProfile({
      name: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
      defaultAccount: 'e.tanev@decisioninc.com',
      browserChannel: 'chrome',
      userDataDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'evidence')
    });

    const result = await runCli(['--json', 'doctor', 'session']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: true,
      data: {
        status: 'ok',
        profile: 'sandbox'
      }
    });
  });

  it('blocks disabled command families with a stable JSON envelope', async () => {
    const result = await runCli(['--json', '--enable-commands', 'auth,doctor', 'formula', 'validate']);

    expect(result.exitCode).toBe(ExitCode.CommandDisabled);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'COMMAND_DISABLED',
        message: 'Command family "formula" is disabled by --enable-commands.',
        exitCode: ExitCode.CommandDisabled
      }
    });
  });

  it('validates the frozen pilot bundle through doctor pilot', async () => {
    const homes = await makeIsolatedHomes();
    const bundleRoot = await writePilotBundle(homes.root);

    const result = await runCli(['--json', 'doctor', 'pilot', '--root', homes.root]);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout ?? '')).toMatchObject({
      ok: true,
      data: {
        status: 'ok',
        bundleRoot,
        storyKey: 'forecast-story',
        dataActionKey: 'fx-translation',
        stepCount: 1,
        widgetCount: 1,
        acceptanceCheckCount: 3
      }
    });
  });

  it('returns a stable JSON error envelope when doctor pilot finds an invalid bundle', async () => {
    const homes = await makeIsolatedHomes();
    const bundleRoot = await writePilotBundle(homes.root);
    await writeFile(path.join(bundleRoot, 'steps', 'fx_trans.af'), '', 'utf8');

    const result = await runCli(['--json', 'doctor', 'pilot', '--root', homes.root]);

    expect(result.exitCode).toBe(ExitCode.InvalidInput);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'PILOT_BUNDLE_INVALID',
        message: 'Pilot bundle is invalid: data-action step "fx-trans" must not be empty.',
        exitCode: ExitCode.InvalidInput
      }
    });
  });

  it('renders help text with the minimum week-1 command groups', async () => {
    const result = await runCli(['--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('auth');
    expect(result.stdout).toContain('data-action');
    expect(result.stdout).toContain('formula');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).not.toContain('discover');
    expect(result.stdout).not.toContain('versions');
  });
});
