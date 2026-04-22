import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('formula command wiring', () => {
  it('routes formula validate through the formula services dependency', async () => {
    const validate = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'valid',
        issues: [],
        validationSource: 'objectmgr',
        runtimeMode: 'captured-request-replay'
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'formula', 'validate', '--root', '/tmp/project'],
      {
        formulaServices: {
          validate,
          verifyPilot: vi.fn()
        }
      }
    );

    expect(validate).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'valid',
        issues: [],
        validationSource: 'objectmgr',
        runtimeMode: 'captured-request-replay'
      }
    });
  });

  it('routes formula verify-pilot through the formula services dependency', async () => {
    const verifyPilot = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'readback-stable',
        mode: 'non-mutating',
        normalizedHash: 'abc123',
        validationSource: 'dom-fallback'
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'formula', 'verify-pilot', '--root', '/tmp/project', '--evidence-dir', '/tmp/evidence'],
      {
        formulaServices: {
          validate: vi.fn(),
          verifyPilot
        }
      }
    );

    expect(verifyPilot).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      evidenceDir: '/tmp/evidence',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'readback-stable',
        mode: 'non-mutating',
        normalizedHash: 'abc123',
        validationSource: 'dom-fallback'
      }
    });
  });

  it('lists validate in formula help output', async () => {
    const result = await runCli(['formula', '--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('validate');
    expect(result.stdout).toContain('verify-pilot');
  });
});
