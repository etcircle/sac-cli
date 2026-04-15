import { ExitCode } from './exit-codes.js';

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: ExitCode
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function assertCommandEnabled(enabledCommands: string[] | undefined, commandFamily: string): void {
  if (!enabledCommands || enabledCommands.length === 0) {
    return;
  }

  if (!enabledCommands.includes(commandFamily)) {
    throw new CliError(
      'COMMAND_DISABLED',
      `Command family "${commandFamily}" is disabled by --enable-commands.`,
      ExitCode.CommandDisabled
    );
  }
}
