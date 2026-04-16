import { Command } from 'commander';
import { assertCommandEnabled } from '../app/command-guard.js';
import { type CommandEnvelope } from '../app/output.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import {
  type VerifyPilotDependencies,
  verifyPilotFormula
} from '../formula/verify-pilot.js';

export type FormulaServices = {
  verifyPilot(input: {
    projectRoot?: string;
    evidenceDir?: string;
    profileName?: string;
  }): Promise<CommandEnvelope>;
};

export type FormulaGlobalOptions = {
  profile?: string;
  enableCommands?: string[];
};

export type FormulaCommandDependencies = Pick<VerifyPilotDependencies, 'runtime' | 'sessionFactory' | 'probe'> & {
  paths?: ConfigPaths;
  store?: ProfileStore;
};

export type RegisterFormulaCommandsOptions = {
  getOptions: () => FormulaGlobalOptions;
  setEnvelope: (envelope: CommandEnvelope) => void;
  formulaServices?: FormulaServices;
  dependencies?: FormulaCommandDependencies;
};

export function createFormulaServices(dependencies: FormulaCommandDependencies = {}): FormulaServices {
  const paths = dependencies.paths ?? createConfigPaths();
  const store = dependencies.store ?? createProfileStore(paths);

  return {
    async verifyPilot(input) {
      const result = await verifyPilotFormula(input, {
        paths,
        store,
        runtime: dependencies.runtime,
        sessionFactory: dependencies.sessionFactory,
        probe: dependencies.probe
      });

      return {
        ok: true,
        data: result
      };
    }
  };
}

export function registerFormulaCommands(formulaCommand: Command, options: RegisterFormulaCommandsOptions): void {
  const formulaServices = options.formulaServices ?? createFormulaServices(options.dependencies);

  const guard = () => {
    assertCommandEnabled(options.getOptions().enableCommands, 'formula');
  };

  formulaCommand
    .command('verify-pilot')
    .description('Run the non-mutating frozen pilot AF readback proof lane')
    .option('--root <path>', 'Project root containing the checked-in pilot/ bundle')
    .option('--evidence-dir <path>', 'Output directory for manifest-required proof artifacts')
    .action(async (commandOptions: { root?: string; evidenceDir?: string }) => {
      guard();
      options.setEnvelope(
        await formulaServices.verifyPilot({
          projectRoot: commandOptions.root,
          evidenceDir: commandOptions.evidenceDir,
          profileName: options.getOptions().profile
        })
      );
    });
}
