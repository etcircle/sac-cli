import { Command, CommanderError } from 'commander';
import { registerAuthCommands, type AuthServices } from './auth.js';
import { registerDataActionCommands, type DataActionServices } from './data-action.js';
import { registerFormulaCommands, type FormulaServices } from './formula.js';
import { assertCommandEnabled, CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { CommandEnvelope, formatJsonEnvelope, formatPlainText } from '../app/output.js';
import { createConfigPaths } from '../config/paths.js';
import { createProfileStore } from '../config/profile-store.js';
import { inspectPilotBundle } from '../pilot/bundle.js';

export type CliResult = {
  exitCode: ExitCode;
  stdout: string;
  stderr: string;
};

type GlobalOptions = {
  profile?: string;
  json?: boolean;
  plain?: boolean;
  select?: string;
  dryRun?: boolean;
  input?: boolean;
  enableCommands?: string[];
};

type CaptureState = {
  stdout: string;
  stderr: string;
};

export type RunCliDependencies = {
  authServices?: AuthServices;
  dataActionServices?: DataActionServices;
  formulaServices?: FormulaServices;
};

function parseEnabledCommands(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createProgram(
  capture: CaptureState,
  dependencies: RunCliDependencies = {}
): { program: Command; getEnvelope: () => CommandEnvelope | null } {
  let envelope: CommandEnvelope | null = null;

  const program = new Command();
  program
    .name('sac-cli')
    .description('CLI-first SAC proof tool')
    .option('--profile <name>', 'Profile name to use for SAC session-backed operations')
    .option('--json', 'Emit machine-readable JSON on stdout')
    .option('--plain', 'Emit plain parseable text on stdout')
    .option('--select <path>', 'Select a field from the result envelope')
    .option('--dry-run', 'Resolve commands without executing mutations')
    .option('--no-input', 'Disable interactive prompts')
    .option('--enable-commands <commands>', 'Comma-separated command family allowlist', parseEnabledCommands)
    .showHelpAfterError();

  program.configureOutput({
    writeOut: (message) => {
      capture.stdout += message;
    },
    writeErr: (message) => {
      capture.stderr += message;
    },
    outputError: (message, write) => {
      write(message);
    }
  });

  program.exitOverride();

  const getOptions = (): GlobalOptions => program.opts<GlobalOptions>();

  const auth = program.command('auth').description('Manage SAC browser-backed auth profiles');
  registerAuthCommands(auth, {
    getOptions,
    setEnvelope: (nextEnvelope) => {
      envelope = nextEnvelope;
    },
    authServices: dependencies.authServices
  });

  const dataAction = program.command('data-action').description('Read frozen pilot data-action metadata and live summaries');
  registerDataActionCommands(dataAction, {
    getOptions,
    setEnvelope: (nextEnvelope) => {
      envelope = nextEnvelope;
    },
    dataActionServices: dependencies.dataActionServices
  });

  const formula = program.command('formula').description('Validate and verify Advanced Formula artifacts');
  registerFormulaCommands(formula, {
    getOptions,
    setEnvelope: (nextEnvelope) => {
      envelope = nextEnvelope;
    },
    formulaServices: dependencies.formulaServices
  });

  const doctor = program.command('doctor').description('Run minimal diagnostics');
  doctor.command('session').description('Check whether a profile-backed browser session is usable').action(async () => {
    assertCommandEnabled(getOptions().enableCommands, 'doctor');

    const profile = await createProfileStore(createConfigPaths()).resolveProfile(getOptions().profile);

    envelope = {
      ok: true,
      data: {
        status: 'ok',
        profile: profile.name
      }
    };
  });
  doctor
    .command('pilot')
    .description('Validate the frozen proof inputs and pilot artifacts bundle')
    .option('--root <path>', 'Project root containing the pilot/ bundle')
    .action(async (commandOptions: { root?: string }) => {
      assertCommandEnabled(getOptions().enableCommands, 'doctor');

      const inspection = await inspectPilotBundle(commandOptions.root ?? process.cwd());
      envelope = {
        ok: true,
        data: {
          status: 'ok',
          bundleRoot: inspection.bundleRoot,
          storyKey: inspection.story.key,
          dataActionKey: inspection.dataAction.key,
          stepCount: inspection.dataAction.steps.length,
          widgetCount: inspection.widgets.length,
          acceptanceCheckCount: inspection.acceptanceChecks.length,
          bundleFingerprint: inspection.bundleFingerprint
        }
      };
    });

  return {
    program,
    getEnvelope: () => envelope
  };
}

function renderEnvelope(envelope: CommandEnvelope, options: GlobalOptions, capture: CaptureState): CliResult {
  if (options.json) {
    capture.stdout += `${formatJsonEnvelope(envelope)}\n`;
  } else if (options.plain) {
    capture.stdout += `${formatPlainText(envelope)}\n`;
  } else {
    capture.stderr += `${formatPlainText(envelope)}\n`;
  }

  return {
    exitCode: envelope.ok ? ExitCode.Success : envelope.error.exitCode,
    stdout: capture.stdout,
    stderr: capture.stderr
  };
}

function toErrorEnvelope(error: unknown): CommandEnvelope {
  if (error instanceof CliError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        exitCode: error.exitCode
      }
    };
  }

  return {
    ok: false,
    error: {
      code: 'GENERAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown CLI failure',
      exitCode: ExitCode.GeneralError
    }
  };
}

export async function runCli(args: string[], dependencies: RunCliDependencies = {}): Promise<CliResult> {
  const capture: CaptureState = { stdout: '', stderr: '' };
  const { program, getEnvelope } = createProgram(capture, dependencies);

  try {
    await program.parseAsync(args, { from: 'user' });
    const envelope = getEnvelope();

    if (envelope) {
      return renderEnvelope(envelope, program.opts<GlobalOptions>(), capture);
    }

    return {
      exitCode: ExitCode.Success,
      stdout: capture.stdout,
      stderr: capture.stderr
    };
  } catch (error) {
    if (error instanceof CommanderError) {
      return {
        exitCode: error.exitCode as ExitCode,
        stdout: capture.stdout,
        stderr: capture.stderr
      };
    }

    const envelope = toErrorEnvelope(error);
    return renderEnvelope(envelope, program.opts<GlobalOptions>(), capture);
  }
}
