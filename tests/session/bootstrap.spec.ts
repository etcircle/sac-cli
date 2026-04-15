import { access, mkdir, readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExitCode } from '../../src/app/exit-codes.js';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { checkAuthStatus, listAuthProfiles, logoutAuthProfile, runAuthLogin } from '../../src/session/bootstrap.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-auth-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

describe('auth bootstrap', () => {
  it('runs headed login, prompts the user, and stores only local profile metadata', async () => {
    const homes = await makeIsolatedHomes();
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);

    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const prompt = vi.fn().mockResolvedValue(undefined);

    const result = await runAuthLogin(
      {
        profileName: 'sandbox',
        tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
        defaultAccount: 'e.tanev@decisioninc.com',
        browserChannel: 'chrome',
        notes: 'manual login',
        setDefault: true,
        inputEnabled: true
      },
      {
        store,
        paths,
        prompt,
        sessionFactory: async () => ({
          page: {
            goto,
            url: () => 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
            screenshot: vi.fn().mockResolvedValue(undefined)
          },
          context: {
            pages: () => [],
            newPage: vi.fn(),
            close
          },
          close,
          takeScreenshot: vi.fn()
        })
      }
    );

    expect(goto).toHaveBeenCalledWith('https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html', { waitUntil: 'domcontentloaded' });
    expect(prompt).toHaveBeenCalledOnce();
    expect(result.profile.userDataDir).toBe(paths.browserUserDataDir('sandbox'));
    expect(result.profile.defaultEvidenceDir).toBe(paths.evidenceDir('sandbox'));

    const saved = await store.resolveProfile('sandbox');
    expect(saved).toMatchObject({
      name: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
      defaultAccount: 'e.tanev@decisioninc.com',
      browserChannel: 'chrome',
      notes: 'manual login'
    });

    const profilesJson = JSON.parse(await readFile(paths.profilesFile, 'utf8'));
    expect(profilesJson.defaultProfile).toBe('sandbox');
    expect(profilesJson.profiles.sandbox).not.toHaveProperty('password');
    expect(close).toHaveBeenCalled();
  });

  it('fails login if the browser does not remain on the SAC app route after prompt completion', async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      runAuthLogin(
        {
          profileName: 'sandbox',
          tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
          inputEnabled: true
        },
        {
          prompt: vi.fn().mockResolvedValue(undefined),
          sessionFactory: async () => ({
            page: {
              goto: vi.fn().mockResolvedValue(undefined),
              url: () => 'https://accounts.sap.example.invalid/login',
              screenshot: vi.fn().mockResolvedValue(undefined)
            },
            context: {
              pages: () => [],
              newPage: vi.fn(),
              close
            },
            close,
            takeScreenshot: vi.fn()
          })
        }
      )
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_READY',
      exitCode: ExitCode.GeneralError
    });
  });

  it('rejects an invalid browser channel before launching a browser session', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const sessionFactory = vi.fn();

    await expect(
      runAuthLogin(
        {
          profileName: 'sandbox',
          tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
          browserChannel: 'safari' as never,
          inputEnabled: true
        },
        {
          prompt,
          sessionFactory
        }
      )
    ).rejects.toMatchObject({
      name: 'ZodError'
    });
    expect(sessionFactory).not.toHaveBeenCalled();
  });

  it('rejects auth login when interactive input is disabled', async () => {
    await expect(
      runAuthLogin(
        {
          profileName: 'sandbox',
          tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
          inputEnabled: false
        },
        {
          sessionFactory: async () => {
            throw new Error('should not launch');
          }
        }
      )
    ).rejects.toMatchObject({
      code: 'INTERACTIVE_LOGIN_REQUIRED',
      exitCode: ExitCode.InvalidInput
    });
  });

  it('checks auth status by reopening the stored app url', async () => {
    const goto = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);

    const result = await checkAuthStatus(
      {
        name: 'sandbox',
        tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
        defaultAccount: 'e.tanev@decisioninc.com',
        browserChannel: 'chrome',
        userDataDir: '/tmp/sandbox/browser',
        defaultEvidenceDir: '/tmp/sandbox/evidence'
      },
      {
        sessionFactory: async () => ({
          page: {
            goto,
            url: () => 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html#shell',
            screenshot: vi.fn().mockResolvedValue(undefined)
          },
          context: {
            pages: () => [],
            newPage: vi.fn(),
            close
          },
          close,
          takeScreenshot: vi.fn()
        })
      }
    );

    expect(goto).toHaveBeenCalledWith('https://decisioninc-1.eu10.hcs.cloud.sap', { waitUntil: 'domcontentloaded' });
    expect(result).toEqual({
      status: 'ok',
      profile: 'sandbox',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
      currentUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html#shell'
    });
    expect(close).toHaveBeenCalled();
  });

  it('fails auth status when the persistent session is redirected away from the app url', async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      checkAuthStatus(
        {
          name: 'sandbox',
          tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
          defaultAccount: 'e.tanev@decisioninc.com',
          browserChannel: 'chrome',
          userDataDir: '/tmp/sandbox/browser',
          defaultEvidenceDir: '/tmp/sandbox/evidence'
        },
        {
          sessionFactory: async () => ({
            page: {
              goto: vi.fn().mockResolvedValue(undefined),
              url: () => 'https://accounts.sap.example.invalid/login',
              screenshot: vi.fn().mockResolvedValue(undefined)
            },
            context: {
              pages: () => [],
              newPage: vi.fn(),
              close
            },
            close,
            takeScreenshot: vi.fn()
          })
        }
      )
    ).rejects.toMatchObject({
      code: 'SESSION_NOT_READY',
      exitCode: ExitCode.GeneralError
    });
  });

  it('invalidates only the local browser session directory on logout', async () => {
    const homes = await makeIsolatedHomes();
    const browserDir = path.join(homes.dataHome, 'profiles', 'sandbox', 'browser');
    await mkdir(browserDir, { recursive: true });

    const result = await logoutAuthProfile(
      {
        name: 'sandbox',
        tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
        defaultAccount: 'e.tanev@decisioninc.com',
        browserChannel: 'chrome',
        userDataDir: browserDir,
        defaultEvidenceDir: path.join(homes.dataHome, 'profiles', 'sandbox', 'evidence')
      }
    );

    await expect(access(browserDir)).rejects.toBeDefined();
    expect(result).toEqual({
      status: 'logged-out',
      profile: 'sandbox',
      removedPath: browserDir
    });
  });

  it('lists stored auth profiles in name order', async () => {
    const homes = await makeIsolatedHomes();
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);

    await store.saveProfile({
      name: 'beta',
      tenantUrl: 'https://beta.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'beta@example.invalid',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir('beta'),
      defaultEvidenceDir: paths.evidenceDir('beta')
    });
    await store.saveProfile({
      name: 'alpha',
      tenantUrl: 'https://alpha.example.invalid/sap/fpa/ui/app.html',
      defaultAccount: 'alpha@example.invalid',
      browserChannel: 'msedge',
      userDataDir: paths.browserUserDataDir('alpha'),
      defaultEvidenceDir: paths.evidenceDir('alpha')
    });

    const result = await listAuthProfiles(store);
    expect(result.count).toBe(2);
    expect(result.profiles.map((profile) => profile.name)).toEqual(['alpha', 'beta']);
  });
});
