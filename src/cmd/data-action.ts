import { Command } from 'commander';
import { assertCommandEnabled } from '../app/command-guard.js';
import { type CommandEnvelope } from '../app/output.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import {
  readDataAction,
  readDataActionSteps,
  type DataActionReadDependencies,
  type ReadDataActionInput
} from '../data-action/read.js';

export type DataActionServices = {
  get(input: ReadDataActionInput): Promise<CommandEnvelope>;
  steps(input: ReadDataActionInput): Promise<CommandEnvelope>;
};

export type DataActionGlobalOptions = {
  profile?: string;
  enableCommands?: string[];
};

export type DataActionCommandDependencies = Omit<DataActionReadDependencies, 'paths' | 'store'> & {
  paths?: ConfigPaths;
  store?: ProfileStore;
};

export type RegisterDataActionCommandsOptions = {
  getOptions: () => DataActionGlobalOptions;
  setEnvelope: (envelope: CommandEnvelope) => void;
  dataActionServices?: DataActionServices;
  dependencies?: DataActionCommandDependencies;
};

export function createDataActionServices(dependencies: DataActionCommandDependencies = {}): DataActionServices {
  const paths = dependencies.paths ?? createConfigPaths();
  const store = dependencies.store ?? createProfileStore(paths);

  return {
    async get(input) {
      return {
        ok: true,
        data: await readDataAction(input, {
          paths,
          store,
          runtime: dependencies.runtime,
          sessionFactory: dependencies.sessionFactory,
          objectMgrFactory: dependencies.objectMgrFactory
        })
      };
    },
    async steps(input) {
      return {
        ok: true,
        data: await readDataActionSteps(input, {
          paths,
          store,
          runtime: dependencies.runtime,
          sessionFactory: dependencies.sessionFactory,
          objectMgrFactory: dependencies.objectMgrFactory
        })
      };
    }
  };
}

export function registerDataActionCommands(dataActionCommand: Command, options: RegisterDataActionCommandsOptions): void {
  const dataActionServices = options.dataActionServices ?? createDataActionServices(options.dependencies);

  const guard = () => {
    assertCommandEnabled(options.getOptions().enableCommands, 'data-action');
  };

  dataActionCommand
    .command('get')
    .description('Get the frozen pilot data action with explicit bundle/deployment/live sections')
    .option('--root <path>', 'Project root containing the checked-in pilot/ bundle')
    .action(async (commandOptions: { root?: string }) => {
      guard();
      options.setEnvelope(await dataActionServices.get({
        projectRoot: commandOptions.root,
        profileName: options.getOptions().profile
      }));
    });

  dataActionCommand
    .command('steps')
    .description('List ordered frozen pilot data-action steps and mark the proof step')
    .option('--root <path>', 'Project root containing the checked-in pilot/ bundle')
    .action(async (commandOptions: { root?: string }) => {
      guard();
      options.setEnvelope(await dataActionServices.steps({
        projectRoot: commandOptions.root,
        profileName: options.getOptions().profile
      }));
    });
}
