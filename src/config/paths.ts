import os from 'node:os';
import path from 'node:path';

export type ConfigPaths = {
  configHome: string;
  dataHome: string;
  profilesFile: string;
  profileDirectory: (name: string) => string;
  browserUserDataDir: (name: string) => string;
  evidenceDir: (name: string) => string;
};

function defaultConfigHome(): string {
  return path.join(os.homedir(), '.config', 'sac-cli');
}

function defaultDataHome(): string {
  return path.join(os.homedir(), '.local', 'share', 'sac-cli');
}

export function createConfigPaths(env: NodeJS.ProcessEnv = process.env): ConfigPaths {
  const configHome = env.SAC_CLI_CONFIG_HOME?.trim() || defaultConfigHome();
  const dataHome = env.SAC_CLI_DATA_HOME?.trim() || defaultDataHome();

  return {
    configHome,
    dataHome,
    profilesFile: path.join(configHome, 'profiles.json'),
    profileDirectory: (name: string) => path.join(dataHome, 'profiles', name),
    browserUserDataDir: (name: string) => path.join(dataHome, 'profiles', name, 'browser'),
    evidenceDir: (name: string) => path.join(dataHome, 'profiles', name, 'evidence')
  };
}
