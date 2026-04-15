import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-auth-cmd-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

describe('auth command wiring', () => {
  it('routes auth login through the auth services dependency', async () => {
    const login = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'logged-in',
        profile: 'sandbox'
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'sandbox', 'auth', 'login', '--tenant', 'https://decisioninc-1.eu10.hcs.cloud.sap'],
      {
        authServices: {
          login,
          status: vi.fn(),
          logout: vi.fn(),
          profiles: vi.fn()
        }
      }
    );

    expect(login).toHaveBeenCalledWith({
      profileName: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
      defaultAccount: undefined,
      browserChannel: undefined,
      notes: undefined,
      setDefault: false,
      inputEnabled: true
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'logged-in',
        profile: 'sandbox'
      }
    });
  });

  it('requires an explicit --profile for auth login', async () => {
    const result = await runCli(['--json', 'auth', 'login', '--tenant', 'https://decisioninc-1.eu10.hcs.cloud.sap']);

    expect(result.exitCode).toBe(ExitCode.ProfileRequired);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: false,
      error: {
        code: 'PROFILE_REQUIRED',
        message: 'auth login requires --profile to name the local browser profile.',
        exitCode: ExitCode.ProfileRequired
      }
    });
  });

  it('routes auth profiles through the auth services dependency', async () => {
    const profiles = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        count: 1,
        profiles: [{ name: 'sandbox' }]
      }
    });

    const result = await runCli(['--json', 'auth', 'profiles'], {
      authServices: {
        login: vi.fn(),
        status: vi.fn(),
        logout: vi.fn(),
        profiles
      }
    });

    expect(profiles).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        count: 1,
        profiles: [{ name: 'sandbox' }]
      }
    });
  });

  it('removes the stored profile on auth logout', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const paths = createConfigPaths();
    const store = createProfileStore(paths);
    await store.saveProfile({
      name: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
      defaultAccount: 'e.tanev@decisioninc.com',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir('sandbox'),
      defaultEvidenceDir: paths.evidenceDir('sandbox')
    });

    const result = await runCli(['--json', '--profile', 'sandbox', 'auth', 'logout']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'logged-out',
        profile: 'sandbox',
        removedPath: paths.browserUserDataDir('sandbox')
      }
    });
    expect(await store.getProfile('sandbox')).toBeNull();
  });
});
