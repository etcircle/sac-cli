import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { ExitCode } from '../../src/app/exit-codes.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-config-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('profile store', () => {
  it('creates, loads, updates, lists, and deletes profiles', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);

    const store = createProfileStore(createConfigPaths());

    await store.saveProfile({
      name: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
      defaultAccount: 'e.tanev@decisioninc.com',
      browserChannel: 'chrome',
      userDataDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'evidence'),
      notes: 'first profile'
    });

    await store.saveProfile({
      name: 'prod',
      tenantUrl: 'https://prod.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'ops@example.invalid',
      browserChannel: 'msedge',
      userDataDir: path.join(homes.dataHome, 'profiles', 'prod', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'prod', 'evidence')
    });

    await store.saveProfile({
      name: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
      defaultAccount: 'felix.cardix@gmail.com',
      browserChannel: 'chrome',
      userDataDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'evidence'),
      notes: 'updated profile'
    });

    const sandbox = await store.getProfile('sandbox');
    const allProfiles = await store.listProfiles();

    expect(sandbox).toMatchObject({
      name: 'sandbox',
      defaultAccount: 'felix.cardix@gmail.com',
      notes: 'updated profile'
    });
    expect(allProfiles.map((profile) => profile.name)).toEqual(['prod', 'sandbox']);

    await store.deleteProfile('prod');

    expect(await store.getProfile('prod')).toBeNull();
    expect((await store.listProfiles()).map((profile) => profile.name)).toEqual(['sandbox']);
  });

  it('resolves profile in deterministic order: flag -> env -> configured default -> sole profile', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const store = createProfileStore(createConfigPaths());
    await store.saveProfile({
      name: 'alpha',
      tenantUrl: 'https://alpha.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'alpha@example.invalid',
      browserChannel: 'chrome',
      userDataDir: path.join(homes.dataHome, 'profiles', 'alpha', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'alpha', 'evidence')
    });
    await store.saveProfile({
      name: 'beta',
      tenantUrl: 'https://beta.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'beta@example.invalid',
      browserChannel: 'chromium',
      userDataDir: path.join(homes.dataHome, 'profiles', 'beta', 'browser'),
      defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'beta', 'evidence')
    });
    await store.setDefaultProfile('beta');

    vi.stubEnv('SAC_CLI_PROFILE', 'alpha');

    await expect(store.resolveProfile('beta')).resolves.toMatchObject({ name: 'beta' });
    await expect(store.resolveProfile()).resolves.toMatchObject({ name: 'alpha' });

    vi.stubEnv('SAC_CLI_PROFILE', '');
    await expect(store.resolveProfile()).resolves.toMatchObject({ name: 'beta' });

    await store.setDefaultProfile(null);
    await store.deleteProfile('beta');
    await expect(store.resolveProfile()).resolves.toMatchObject({ name: 'alpha' });
  });

  it('throws stable profile errors when resolution fails or the requested profile is missing', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const store = createProfileStore(createConfigPaths());

    await expect(store.resolveProfile()).rejects.toMatchObject({
      code: 'PROFILE_REQUIRED',
      exitCode: ExitCode.ProfileRequired,
      message: 'A profile is required. Pass --profile, set SAC_CLI_PROFILE, or configure a default profile.'
    });

    await expect(store.resolveProfile('missing')).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      exitCode: ExitCode.ProfileNotFound,
      message: 'Profile "missing" does not exist.'
    });
  });

  it('throws a stable config error for malformed profile state', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const paths = createConfigPaths();
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(paths.configHome, { recursive: true }).then(() =>
        writeFile(paths.profilesFile, '{not-json', 'utf8')
      )
    );

    const store = createProfileStore(paths);

    await expect(store.resolveProfile()).rejects.toMatchObject({
      code: 'PROFILE_CONFIG_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Profile configuration file is invalid. Fix or remove profiles.json before retrying.'
    });
  });

  it('rejects profile state with non-canonical profile keys', async () => {
    const homes = await makeIsolatedHomes();
    vi.stubEnv('SAC_CLI_CONFIG_HOME', homes.configHome);
    vi.stubEnv('SAC_CLI_DATA_HOME', homes.dataHome);
    vi.stubEnv('SAC_CLI_PROFILE', '');

    const paths = createConfigPaths();
    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(paths.configHome, { recursive: true }).then(() =>
        writeFile(
          paths.profilesFile,
          JSON.stringify({
            defaultProfile: 'sandbox',
            profiles: {
              ' sandbox ': {
                name: 'sandbox',
                tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
                defaultAccount: 'e.tanev@decisioninc.com',
                browserChannel: 'chrome',
                userDataDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'browser'),
                defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'evidence')
              }
            }
          }),
          'utf8'
        )
      )
    );

    const store = createProfileStore(paths);

    await expect(store.resolveProfile()).rejects.toMatchObject({
      code: 'PROFILE_CONFIG_INVALID',
      exitCode: ExitCode.InvalidInput,
      message: 'Profile configuration file is invalid. Fix or remove profiles.json before retrying.'
    });
  });
});
