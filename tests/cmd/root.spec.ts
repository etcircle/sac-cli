import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('root CLI', () => {
  it('returns a stable JSON envelope for doctor session before auth is configured', async () => {
    const result = await runCli(['--json', 'doctor', 'session']);

    expect(result.exitCode).toBe(ExitCode.ProfileRequired);
    expect(result.stdout).not.toBeNull();
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'PROFILE_REQUIRED',
        message: 'A profile is required for doctor session. Pass --profile or configure a default profile.',
        exitCode: ExitCode.ProfileRequired
      }
    });
    expect(result.stderr).toBe('');
  });

  it('blocks disabled command families with a stable JSON envelope', async () => {
    const result = await runCli(['--json', '--enable-commands', 'auth,doctor', 'formula', 'validate']);

    expect(result.exitCode).toBe(ExitCode.CommandDisabled);
    expect(JSON.parse(result.stdout ?? '')).toEqual({
      ok: false,
      error: {
        code: 'COMMAND_DISABLED',
        message: 'Command family "formula" is disabled by --enable-commands.',
        exitCode: ExitCode.CommandDisabled
      }
    });
  });

  it('renders help text with the minimum week-1 command groups', async () => {
    const result = await runCli(['--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('auth');
    expect(result.stdout).toContain('data-action');
    expect(result.stdout).toContain('formula');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).not.toContain('discover');
    expect(result.stdout).not.toContain('versions');
  });
});
