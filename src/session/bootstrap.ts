import { rm } from 'node:fs/promises';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { profileSchema, type BrowserChannel, type SacCliProfile } from '../config/schema.js';
import {
  type BrowserRuntime,
  type ManagedBrowserSession,
  createDefaultBrowserRuntime,
  ensureSacAppUrl,
  launchPersistentBrowserSession
} from './browser-session.js';

export type LoginCommandInput = {
  profileName: string;
  tenantUrl: string;
  defaultAccount?: string;
  browserChannel?: BrowserChannel;
  notes?: string;
  setDefault?: boolean;
  inputEnabled: boolean;
};

export type LoginResult = {
  profile: SacCliProfile;
  appUrl: string;
};

export type AuthStatusResult = {
  status: 'ok';
  profile: string;
  tenantUrl: string;
  currentUrl: string;
};

export type LogoutResult = {
  status: 'logged-out';
  profile: string;
  removedPath: string;
};

export type AuthProfilesResult = {
  count: number;
  profiles: Array<{
    name: string;
    tenantUrl: string;
    browserChannel: BrowserChannel;
  }>;
};

export type AuthBootstrapDependencies = {
  paths?: ConfigPaths;
  store?: ProfileStore;
  runtime?: BrowserRuntime;
  sessionFactory?: (profile: SacCliProfile) => Promise<ManagedBrowserSession>;
  prompt?: (message: string) => Promise<void>;
  removeDir?: (targetPath: string, options: { recursive: boolean; force: boolean }) => Promise<void>;
};

function createInteractiveLoginRequiredError(): CliError {
  return new CliError(
    'INTERACTIVE_LOGIN_REQUIRED',
    'auth login requires interactive input. Remove --no-input and complete SSO/MFA in the headed browser.',
    ExitCode.InvalidInput
  );
}

function createSessionNotReadyError(): CliError {
  return new CliError(
    'SESSION_NOT_READY',
    'SAC session is not usable yet. The browser did not remain on /sap/fpa/ui/app.html.',
    ExitCode.GeneralError
  );
}

function assertSessionUsable(currentUrl: string, expectedAppUrl: string): void {
  const current = new URL(currentUrl);
  const expected = new URL(ensureSacAppUrl(expectedAppUrl));

  if (current.origin !== expected.origin || current.pathname !== expected.pathname) {
    throw createSessionNotReadyError();
  }
}

function createDefaultAccount(profileName: string): string {
  return `${profileName}@local.invalid`;
}

async function defaultPrompt(message: string): Promise<void> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await rl.question(`${message}\nPress Enter when the session is ready. `);
  } finally {
    rl.close();
  }
}

async function createSessionFactory(runtime?: BrowserRuntime): Promise<(profile: SacCliProfile) => Promise<ManagedBrowserSession>> {
  const resolvedRuntime = runtime ?? await createDefaultBrowserRuntime();
  return async (profile: SacCliProfile) => launchPersistentBrowserSession(profile, resolvedRuntime);
}

function createProfileFromLogin(input: LoginCommandInput, paths: ConfigPaths): SacCliProfile {
  const profileName = input.profileName.trim();
  const browserChannel = input.browserChannel ?? 'chrome';

  return profileSchema.parse({
    name: profileName,
    tenantUrl: ensureSacAppUrl(input.tenantUrl),
    defaultAccount: input.defaultAccount?.trim() || createDefaultAccount(profileName),
    browserChannel,
    userDataDir: paths.browserUserDataDir(profileName),
    defaultEvidenceDir: paths.evidenceDir(profileName),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {})
  });
}

export async function runAuthLogin(input: LoginCommandInput, deps: AuthBootstrapDependencies = {}): Promise<LoginResult> {
  if (!input.inputEnabled) {
    throw createInteractiveLoginRequiredError();
  }

  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = createProfileFromLogin(input, paths);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const prompt = deps.prompt ?? defaultPrompt;
  const session = await sessionFactory(profile);

  try {
    await session.page.goto(profile.tenantUrl, { waitUntil: 'domcontentloaded' });
    await prompt(`Complete SSO/MFA for profile "${profile.name}" in the headed browser.`);
    assertSessionUsable(session.page.url(), profile.tenantUrl);
    await store.saveProfile(profile);
    if (input.setDefault) {
      await store.setDefaultProfile(profile.name);
    }
  } finally {
    await session.close();
  }

  return {
    profile,
    appUrl: profile.tenantUrl
  };
}

export async function checkAuthStatus(
  profile: SacCliProfile,
  deps: Pick<AuthBootstrapDependencies, 'runtime' | 'sessionFactory'> = {}
): Promise<AuthStatusResult> {
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const session = await sessionFactory(profile);

  try {
    await session.page.goto(profile.tenantUrl, { waitUntil: 'domcontentloaded' });
    const currentUrl = session.page.url();
    assertSessionUsable(currentUrl, profile.tenantUrl);
    return {
      status: 'ok',
      profile: profile.name,
      tenantUrl: profile.tenantUrl,
      currentUrl
    };
  } finally {
    await session.close();
  }
}

export async function logoutAuthProfile(
  profile: SacCliProfile,
  deps: Pick<AuthBootstrapDependencies, 'removeDir'> = {}
): Promise<LogoutResult> {
  const removeDir = deps.removeDir ?? rm;
  await removeDir(profile.userDataDir, { recursive: true, force: true });

  return {
    status: 'logged-out',
    profile: profile.name,
    removedPath: profile.userDataDir
  };
}

export async function listAuthProfiles(store: ProfileStore): Promise<AuthProfilesResult> {
  const profiles = await store.listProfiles();
  return {
    count: profiles.length,
    profiles: profiles.map((profile) => ({
      name: profile.name,
      tenantUrl: profile.tenantUrl,
      browserChannel: profile.browserChannel
    }))
  };
}
