import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { ConfigPaths } from './paths.js';
import { profileSchema, profileStateSchema, type ProfileState, type SacCliProfile } from './schema.js';

export type ProfileStore = {
  saveProfile(profile: SacCliProfile): Promise<SacCliProfile>;
  getProfile(name: string): Promise<SacCliProfile | null>;
  listProfiles(): Promise<SacCliProfile[]>;
  deleteProfile(name: string): Promise<void>;
  setDefaultProfile(name: string | null): Promise<void>;
  resolveProfile(explicitName?: string): Promise<SacCliProfile>;
};

function normalizeProfileName(name: string | null | undefined): string | undefined {
  const normalized = name?.trim();
  return normalized ? normalized : undefined;
}

function normalizeProfileState(state: ProfileState): ProfileState {
  const normalizedProfiles = Object.entries(state.profiles).reduce<Record<string, SacCliProfile>>((accumulator, [rawKey, profile]) => {
    const normalizedKey = normalizeProfileName(rawKey);
    if (!normalizedKey || rawKey !== normalizedKey || normalizedKey !== profile.name) {
      throw createProfileConfigInvalidError();
    }

    accumulator[normalizedKey] = profile;
    return accumulator;
  }, {});

  const normalizedDefault = normalizeProfileName(state.defaultProfile ?? undefined) ?? null;
  if (normalizedDefault && !(normalizedDefault in normalizedProfiles)) {
    throw createProfileConfigInvalidError();
  }

  return {
    defaultProfile: normalizedDefault,
    profiles: normalizedProfiles
  };
}

function createProfileRequiredError(): CliError {
  return new CliError(
    'PROFILE_REQUIRED',
    'A profile is required. Pass --profile, set SAC_CLI_PROFILE, or configure a default profile.',
    ExitCode.ProfileRequired
  );
}

function createProfileNotFoundError(name: string): CliError {
  return new CliError(
    'PROFILE_NOT_FOUND',
    `Profile \"${name}\" does not exist.`,
    ExitCode.ProfileNotFound
  );
}

function createProfileConfigInvalidError(): CliError {
  return new CliError(
    'PROFILE_CONFIG_INVALID',
    'Profile configuration file is invalid. Fix or remove profiles.json before retrying.',
    ExitCode.InvalidInput
  );
}

export function createProfileStore(paths: ConfigPaths): ProfileStore {
  async function loadState(): Promise<ProfileState> {
    try {
      const raw = await readFile(paths.profilesFile, 'utf8');
      return normalizeProfileState(profileStateSchema.parse(JSON.parse(raw)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return profileStateSchema.parse({ defaultProfile: null, profiles: {} });
      }

      if (error instanceof CliError) {
        throw error;
      }

      throw createProfileConfigInvalidError();
    }
  }

  async function persistState(state: ProfileState): Promise<void> {
    await mkdir(paths.configHome, { recursive: true });
    await writeFile(paths.profilesFile, `${JSON.stringify(profileStateSchema.parse(state), null, 2)}\n`, 'utf8');
  }

  return {
    async saveProfile(profile: SacCliProfile): Promise<SacCliProfile> {
      const parsedProfile = profileSchema.parse(profile);
      const state = await loadState();

      state.profiles[parsedProfile.name] = parsedProfile;

      await mkdir(parsedProfile.userDataDir, { recursive: true });
      await mkdir(parsedProfile.defaultEvidenceDir, { recursive: true });
      await persistState(state);

      return parsedProfile;
    },

    async getProfile(name: string): Promise<SacCliProfile | null> {
      const state = await loadState();
      const normalizedName = normalizeProfileName(name);
      return normalizedName ? state.profiles[normalizedName] ?? null : null;
    },

    async listProfiles(): Promise<SacCliProfile[]> {
      const state = await loadState();
      return Object.values(state.profiles).sort((left, right) => left.name.localeCompare(right.name));
    },

    async deleteProfile(name: string): Promise<void> {
      const state = await loadState();
      const normalizedName = normalizeProfileName(name);

      if (!normalizedName || !(normalizedName in state.profiles)) {
        return;
      }

      delete state.profiles[normalizedName];
      if (state.defaultProfile === normalizedName) {
        state.defaultProfile = null;
      }

      await persistState(state);
    },

    async setDefaultProfile(name: string | null): Promise<void> {
      const state = await loadState();
      const normalizedName = normalizeProfileName(name);

      if (name !== null && !normalizedName) {
        throw createProfileRequiredError();
      }

      if (normalizedName && !(normalizedName in state.profiles)) {
        throw createProfileNotFoundError(normalizedName);
      }

      state.defaultProfile = normalizedName ?? null;
      await persistState(state);
    },

    async resolveProfile(explicitName?: string): Promise<SacCliProfile> {
      const state = await loadState();
      const resolvedName = normalizeProfileName(explicitName)
        || normalizeProfileName(process.env.SAC_CLI_PROFILE)
        || normalizeProfileName(state.defaultProfile)
        || (Object.keys(state.profiles).length === 1 ? Object.keys(state.profiles)[0] : undefined);

      if (!resolvedName) {
        throw createProfileRequiredError();
      }

      const profile = state.profiles[resolvedName];
      if (!profile) {
        throw createProfileNotFoundError(resolvedName);
      }

      return profile;
    }
  };
}
