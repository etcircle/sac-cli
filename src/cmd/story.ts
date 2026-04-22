import { Command, Option } from 'commander';
import { assertCommandEnabled } from '../app/command-guard.js';
import { type CommandEnvelope } from '../app/output.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import { browserAttachModeSchema, type BrowserAttachMode } from '../config/schema.js';
import {
  addStoryTableColumnDimensionFromPilot,
  addStoryTableRowDimensionFromPilot,
  configureStoryTableFromPilot,
  inspectStoryTableCellMenuFromPilot,
  inspectStoryTableMenuFromPilot,
  inspectStoryTablePropertyGatesFromPilot,
  setStoryTableFilterFromPilot,
  type ConfigureStoryTableDependencies,
  type ConfigureStoryTableInput,
  type StoryTableDimensionInput,
  type StoryTableFilterInput
} from '../story/configure-table.js';

export type StoryServices = {
  configureTable(input: ConfigureStoryTableInput): Promise<CommandEnvelope>;
  inspectMenu(input: ConfigureStoryTableInput): Promise<CommandEnvelope>;
  inspectCellMenu(input: ConfigureStoryTableInput): Promise<CommandEnvelope>;
  inspectGates(input: ConfigureStoryTableInput): Promise<CommandEnvelope>;
  addRowDimension(input: StoryTableDimensionInput): Promise<CommandEnvelope>;
  addColumnDimension(input: StoryTableDimensionInput): Promise<CommandEnvelope>;
  setFilter(input: StoryTableFilterInput): Promise<CommandEnvelope>;
};

export type StoryGlobalOptions = {
  profile?: string;
  enableCommands?: string[];
};

export type StoryCommandDependencies = Omit<ConfigureStoryTableDependencies, 'paths' | 'store'> & {
  paths?: ConfigPaths;
  store?: ProfileStore;
};

export type RegisterStoryCommandsOptions = {
  getOptions: () => StoryGlobalOptions;
  setEnvelope: (envelope: CommandEnvelope) => void;
  storyServices?: Partial<StoryServices>;
  dependencies?: StoryCommandDependencies;
};

type StoryBaseOptions = {
  root?: string;
  storyUrl?: string;
  evidenceDir?: string;
  widgetKey?: string;
  browserDebugUrl?: string;
  attachMode?: BrowserAttachMode;
};

type StoryDimensionOptions = StoryBaseOptions & {
  dimension: string;
};

type StoryFilterOptions = StoryBaseOptions & {
  dimension: string;
  value: string;
};

export function createStoryServices(dependencies: StoryCommandDependencies = {}): StoryServices {
  const paths = dependencies.paths ?? createConfigPaths();
  const store = dependencies.store ?? createProfileStore(paths);

  const sharedDependencies = {
    paths,
    store,
    runtime: dependencies.runtime,
    sessionFactory: dependencies.sessionFactory
  } satisfies ConfigureStoryTableDependencies;

  return {
    async configureTable(input) {
      return {
        ok: true,
        data: await configureStoryTableFromPilot(input, sharedDependencies)
      };
    },
    async inspectMenu(input) {
      return {
        ok: true,
        data: await inspectStoryTableMenuFromPilot(input, sharedDependencies)
      };
    },
    async inspectCellMenu(input) {
      return {
        ok: true,
        data: await inspectStoryTableCellMenuFromPilot(input, sharedDependencies)
      };
    },
    async inspectGates(input) {
      return {
        ok: true,
        data: await inspectStoryTablePropertyGatesFromPilot(input, sharedDependencies)
      };
    },
    async addRowDimension(input) {
      return {
        ok: true,
        data: await addStoryTableRowDimensionFromPilot(input, sharedDependencies)
      };
    },
    async addColumnDimension(input) {
      return {
        ok: true,
        data: await addStoryTableColumnDimensionFromPilot(input, sharedDependencies)
      };
    },
    async setFilter(input) {
      return {
        ok: true,
        data: await setStoryTableFilterFromPilot(input, sharedDependencies)
      };
    }
  };
}

function applyStoryTargetOptions(command: Command): Command {
  return command
    .option('--root <path>', 'Project root containing the checked-in pilot/ bundle')
    .option('--story-url <url>', 'Explicit story edit URL override; defaults to the route from the pilot bundle')
    .option('--evidence-dir <path>', 'Output directory for screenshots/evidence')
    .option('--widget-key <key>', 'Pilot widget key to apply; defaults to the sole planning-table widget')
    .option('--browser-debug-url <url>', 'Remote debugging URL for attaching to an existing browser session')
    .addOption(
      new Option(
        '--attach-mode <launch|attach-first|attach-only>',
        'Browser session mode override for story commands'
      ).choices([...browserAttachModeSchema.options])
    );
}

function resolveBaseInput(commandOptions: StoryBaseOptions, profileName?: string): ConfigureStoryTableInput {
  return {
    projectRoot: commandOptions.root,
    storyUrl: commandOptions.storyUrl,
    evidenceDir: commandOptions.evidenceDir,
    widgetKey: commandOptions.widgetKey,
    profileName,
    ...(commandOptions.browserDebugUrl ? { browserDebugUrl: commandOptions.browserDebugUrl } : {}),
    ...(commandOptions.attachMode ? { attachMode: commandOptions.attachMode } : {})
  };
}

export function registerStoryCommands(storyCommand: Command, options: RegisterStoryCommandsOptions): void {
  const storyServices: StoryServices = {
    ...createStoryServices(options.dependencies),
    ...options.storyServices
  };

  const guard = () => {
    assertCommandEnabled(options.getOptions().enableCommands, 'story');
  };

  applyStoryTargetOptions(
    storyCommand
      .command('configure-table')
      .description('Legacy alias for `story table configure` using the pilot widget manifest in one SAC session')
  ).action(async (commandOptions: StoryBaseOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.configureTable(resolveBaseInput(commandOptions, options.getOptions().profile))
    );
  });

  const tableCommand = storyCommand
    .command('table')
    .description('Generic table authoring commands with built-in help and one managed SAC session per command');

  applyStoryTargetOptions(
    tableCommand
      .command('configure')
      .description('Configure the pilot planning table in-place using the checked-in manifest defaults')
  ).action(async (commandOptions: StoryBaseOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.configureTable(resolveBaseInput(commandOptions, options.getOptions().profile))
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('inspect-menu')
      .description('Inspect the visible whole-table More Actions menu entries for the active pilot planning table')
  ).action(async (commandOptions: StoryBaseOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.inspectMenu(resolveBaseInput(commandOptions, options.getOptions().profile))
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('inspect-cell-menu')
      .description('Inspect the visible table cell context-menu entries for the active pilot planning table, including Jump To when present')
  ).action(async (commandOptions: StoryBaseOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.inspectCellMenu(resolveBaseInput(commandOptions, options.getOptions().profile))
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('inspect-gates')
      .description('Inspect visible property gates and table-type hints for the active pilot planning table')
  ).action(async (commandOptions: StoryBaseOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.inspectGates(resolveBaseInput(commandOptions, options.getOptions().profile))
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('add-row-dimension')
      .description('Add one row dimension to the active pilot planning table without reopening SAC mid-command')
      .requiredOption('--dimension <name>', 'Dimension name to add to the Rows axis')
  ).action(async (commandOptions: StoryDimensionOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.addRowDimension({
        ...resolveBaseInput(commandOptions, options.getOptions().profile),
        dimension: commandOptions.dimension
      })
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('add-column-dimension')
      .description('Add one column dimension to the active pilot planning table without reopening SAC mid-command')
      .requiredOption('--dimension <name>', 'Dimension name to add to the Columns axis')
  ).action(async (commandOptions: StoryDimensionOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.addColumnDimension({
        ...resolveBaseInput(commandOptions, options.getOptions().profile),
        dimension: commandOptions.dimension
      })
    );
  });

  applyStoryTargetOptions(
    tableCommand
      .command('set-filter')
      .description('Set a single visible member value for a table filter dimension (generic command, not version-only)')
      .requiredOption('--dimension <name>', 'Filter dimension name, for example Version')
      .requiredOption('--value <member>', 'Visible member value to keep selected, for example Forecast')
  ).action(async (commandOptions: StoryFilterOptions) => {
    guard();
    options.setEnvelope(
      await storyServices.setFilter({
        ...resolveBaseInput(commandOptions, options.getOptions().profile),
        dimension: commandOptions.dimension,
        value: commandOptions.value
      })
    );
  });
}
