import { Command } from 'commander';
import { CliError, assertCommandEnabled } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { type CommandEnvelope } from '../app/output.js';
import { createConfigPaths } from '../config/paths.js';
import { createProfileStore } from '../config/profile-store.js';
import { type BrowserChannel } from '../config/schema.js';
import { checkAuthStatus, listAuthProfiles, logoutAuthProfile, runAuthLogin } from '../session/bootstrap.js';

export type AuthServices = {
  login(input: {
    profileName: string;
    tenantUrl: string;
    defaultAccount?: string;
    browserChannel?: BrowserChannel;
    notes?: string;
    setDefault?: boolean;
    inputEnabled: boolean;
  }): Promise<CommandEnvelope>;
  status(profileName?: string): Promise<CommandEnvelope>;
  logout(profileName?: string): Promise<CommandEnvelope>;
  profiles(): Promise<CommandEnvelope>;
};

export type AuthGlobalOptions = {
  profile?: string;
  input?: boolean;
  enableCommands?: string[];
};

export type RegisterAuthCommandsOptions = {
  getOptions: () => AuthGlobalOptions;
  setEnvelope: (envelope: CommandEnvelope) => void;
  authServices?: AuthServices;
};

export function createAuthServices(): AuthServices {
  const paths = createConfigPaths();
  const store = createProfileStore(paths);

  return {
    async login(input) {
      const result = await runAuthLogin(input, { paths, store });
      return {
        ok: true,
        data: {
          status: 'logged-in',
          profile: result.profile.name,
          tenantUrl: result.profile.tenantUrl,
          browserChannel: result.profile.browserChannel,
          userDataDir: result.profile.userDataDir
        }
      };
    },
    async status(profileName) {
      const profile = await store.resolveProfile(profileName);
      const result = await checkAuthStatus(profile);
      return {
        ok: true,
        data: result
      };
    },
    async logout(profileName) {
      const profile = await store.resolveProfile(profileName);
      const result = await logoutAuthProfile(profile);
      await store.deleteProfile(profile.name);
      return {
        ok: true,
        data: result
      };
    },
    async profiles() {
      const result = await listAuthProfiles(store);
      return {
        ok: true,
        data: result
      };
    }
  };
}

export function registerAuthCommands(authCommand: Command, options: RegisterAuthCommandsOptions): void {
  const authServices = options.authServices ?? createAuthServices();

  const guard = () => {
    assertCommandEnabled(options.getOptions().enableCommands, 'auth');
  };

  const requireExplicitProfile = (): string => {
    const profileName = options.getOptions().profile?.trim();
    if (!profileName) {
      throw new CliError(
        'PROFILE_REQUIRED',
        'auth login requires --profile to name the local browser profile.',
        ExitCode.ProfileRequired
      );
    }

    return profileName;
  };

  authCommand
    .command('login')
    .description('Login with a headed browser session')
    .requiredOption('--tenant <url>', 'SAC tenant URL to open in the headed browser')
    .action(async (commandOptions: {
      tenant: string;
    }) => {
      guard();
      options.setEnvelope(
        await authServices.login({
          profileName: requireExplicitProfile(),
          tenantUrl: commandOptions.tenant,
          defaultAccount: undefined,
          browserChannel: undefined,
          notes: undefined,
          setDefault: false,
          inputEnabled: options.getOptions().input ?? true
        })
      );
    });

  authCommand
    .command('status')
    .description('Check auth/session status')
    .action(async () => {
      guard();
      options.setEnvelope(await authServices.status(options.getOptions().profile));
    });

  authCommand
    .command('logout')
    .description('Remove local browser-backed session state')
    .action(async () => {
      guard();
      options.setEnvelope(await authServices.logout(options.getOptions().profile));
    });

  authCommand
    .command('profiles')
    .description('List configured profiles')
    .action(async () => {
      guard();
      options.setEnvelope(await authServices.profiles());
    });
}
