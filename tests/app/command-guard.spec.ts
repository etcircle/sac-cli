import { describe, expect, it } from 'vitest';
import { assertCommandEnabled } from '../../src/app/command-guard.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('command guard', () => {
  it('allows commands when no allowlist is provided', () => {
    expect(() => assertCommandEnabled(undefined, 'formula')).not.toThrow();
    expect(() => assertCommandEnabled([], 'formula')).not.toThrow();
  });

  it('throws a stable error when a command family is disabled', () => {
    try {
      assertCommandEnabled(['auth', 'doctor'], 'formula');
      throw new Error('expected command guard to throw');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'COMMAND_DISABLED',
        exitCode: ExitCode.CommandDisabled,
        message: 'Command family "formula" is disabled by --enable-commands.'
      });
    }
  });
});
