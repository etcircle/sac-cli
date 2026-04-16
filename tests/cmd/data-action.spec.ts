import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';

describe('data-action command wiring', () => {
  it('routes data-action get through the data-action services dependency', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'ok',
        bundle: {
          key: 'fx-translation'
        },
        deployment: {
          objectName: 'FA9020524E79E7C812C4D1E8D41355B'
        },
        live: {
          version: 14
        }
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'data-action', 'get', '--root', '/tmp/project'],
      {
        dataActionServices: {
          get,
          steps: vi.fn()
        }
      }
    );

    expect(get).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'ok',
        bundle: {
          key: 'fx-translation'
        },
        deployment: {
          objectName: 'FA9020524E79E7C812C4D1E8D41355B'
        },
        live: {
          version: 14
        }
      }
    });
  });

  it('routes data-action steps through the data-action services dependency', async () => {
    const steps = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'ok',
        steps: [
          {
            index: 1,
            key: 'fx-trans',
            isProofStep: true
          }
        ]
      }
    });

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'data-action', 'steps', '--root', '/tmp/project'],
      {
        dataActionServices: {
          get: vi.fn(),
          steps
        }
      }
    );

    expect(steps).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      data: {
        status: 'ok',
        steps: [
          {
            index: 1,
            key: 'fx-trans',
            isProofStep: true
          }
        ]
      }
    });
  });
});
