import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('formula command wiring', () => {
  it('routes formula verify-pilot through the formula services dependency', async () => {
    const verifyPilot = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'readback-stable',
        mode: 'non-mutating',
        normalizedHash: 'abc123'
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'formula', 'verify-pilot', '--root', '/tmp/project', '--evidence-dir', '/tmp/evidence'],
      {
        formulaServices: {
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
        normalizedHash: 'abc123'
      }
    });
  });
});
