import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { writeFile } from 'node:fs/promises';
import { PILOT_BASE_URL, writePilotBundle } from '../helpers/pilot-bundle.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-root-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
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
      tenantUrl: `${PILOT_BASE_URL}/sap/fpa/ui/app.html`,
      defaultAccount: 'sandbox@example.invalid',
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
    const result = await runCli(['--json', '--enable-commands', 'auth,doctor', 'formula', 'verify-pilot']);

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

  it('blocks disabled data-action commands with a stable JSON envelope', async () => {
    const result = await runCli(['--json', '--enable-commands', 'auth,formula,doctor', 'data-action', 'get']);

    expect(result.exitCode).toBe(ExitCode.CommandDisabled);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'COMMAND_DISABLED',
        message: 'Command family "data-action" is disabled by --enable-commands.',
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
