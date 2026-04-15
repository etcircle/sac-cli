import { describe, expect, it } from 'vitest';
import { formatJsonEnvelope, formatPlainText } from '../../src/app/output.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('output formatting', () => {
  it('formats a success envelope as stable JSON', () => {
    const json = formatJsonEnvelope({
      ok: true,
      data: { status: 'ok' }
    });

    expect(JSON.parse(json)).toEqual({
      ok: true,
      data: { status: 'ok' }
    });
  });

  it('formats an error envelope as stable JSON', () => {
    const json = formatJsonEnvelope({
      ok: false,
      error: {
        code: 'COMMAND_DISABLED',
        message: 'formula is disabled',
        exitCode: ExitCode.CommandDisabled
      }
    });

    expect(JSON.parse(json)).toEqual({
      ok: false,
      error: {
        code: 'COMMAND_DISABLED',
        message: 'formula is disabled',
        exitCode: ExitCode.CommandDisabled
      }
    });
  });

  it('formats plain text for success and error envelopes', () => {
    expect(formatPlainText({ ok: true, data: { status: 'ok', target: 'doctor' } })).toBe('status=ok\ntarget=doctor');

    expect(
      formatPlainText({
        ok: false,
        error: {
          code: 'PROFILE_REQUIRED',
          message: 'profile is required',
          exitCode: ExitCode.ProfileRequired
        }
      })
    ).toBe('PROFILE_REQUIRED: profile is required');
  });
});
