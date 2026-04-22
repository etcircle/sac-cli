import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../../src/app/exit-codes.js';
import {
  capabilityNameSchema,
  requestRecordSchema,
  responseRecordSchema,
  workflowCaptureSchema
} from '../../src/capture/types.js';
import { captureWorkflow } from '../../src/capture/workflow-capture.js';
import type { BrowserPage, BrowserRequest, BrowserResponse } from '../../src/session/browser-session.js';

const captureFixturePath = fileURLToPath(
  new URL('../../fixtures/redacted/dataaction.validate/capture.json', import.meta.url)
);

async function readCaptureFixture() {
  const raw = await readFile(captureFixturePath, 'utf8');
  return workflowCaptureSchema.parse(JSON.parse(raw));
}

type MockCapturePageOptions = {
  beforeUrl?: string;
  afterUrl?: string;
  response: BrowserResponse;
  runtimeContext?: {
    tenantId: string;
    csrfToken: string | null;
    tenantDescription: string | null;
  };
  timeoutError?: Error;
};

function createMockCapturePage(options: MockCapturePageOptions): BrowserPage & {
  setCurrentUrl(url: string): void;
} {
  let currentUrl = options.beforeUrl ?? 'https://tenant.example.invalid/sap/fpa/ui/app.html#/stories';

  return {
    goto: vi.fn(),
    screenshot: vi.fn(),
    url: () => currentUrl,
    setCurrentUrl(url: string) {
      currentUrl = url;
    },
    evaluate: vi.fn().mockResolvedValue(options.runtimeContext ?? {
      tenantId: 'J',
      csrfToken: 'csrf-token',
      tenantDescription: 'Tenant Description'
    }),
    waitForResponse: options.timeoutError
      ? vi.fn().mockRejectedValue(options.timeoutError)
      : vi.fn(async (predicate, waitOptions) => {
        expect(waitOptions).toMatchObject({ timeout: expect.any(Number) });
        expect(predicate(options.response)).toBe(true);
        return options.response;
      })
  };
}

describe('workflow capture schema', () => {
  it('accepts the redacted dataaction.validate workflow capture artifact', async () => {
    const capture = await readCaptureFixture();

    expect(capture.capability).toBe('dataaction.validate');
    expect(capture.workflow.label).toContain('validate');
    expect(capture.volatility.baseline).toBe('exact-capture-plus-patch');
    expect(capture.volatility.patchPaths).toEqual([
      '$.request.body.data[2][0].sequenceMetadata.planningSteps[0].scriptContent'
    ]);
    expect(capture.request.body).toMatchObject({
      action: 'callFunction',
      data: ['PLANNINGSEQUENCE', 'validate', expect.any(Array)]
    });
    expect(capture.response.status).toBe(200);
  });

  it('rejects endpoint-shaped or malformed capability names', () => {
    expect(() => capabilityNameSchema.parse('objectmgr/validate')).toThrow();
    expect(() => capabilityNameSchema.parse('dataaction_validate')).toThrow();
    expect(() => capabilityNameSchema.parse('dataaction.validate')).not.toThrow();
  });

  it('requires uppercase HTTP methods and valid response status codes', () => {
    expect(() => requestRecordSchema.parse({
      method: 'post',
      url: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: {}
    })).toThrow();

    expect(() => responseRecordSchema.parse({
      status: 99,
      headers: {}
    })).toThrow();
  });
});

describe('captureWorkflow', () => {
  it('captures one matched browser request/response pair, route context, and writes a JSON artifact', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/contentlib?tenant=J',
      headers: () => ({
        accept: 'application/json',
        'content-type': 'application/json;charset=UTF-8'
      }),
      postData: () => JSON.stringify({ action: 'copyResource', id: 'story-123' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({
        'content-type': 'application/json'
      }),
      text: () => Promise.resolve(JSON.stringify({ id: 'story-copy-456', ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({
      beforeUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/stories',
      afterUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story&/edit/story-copy-456',
      response
    });
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-workflow-capture-'));
    const artifactPath = path.join(tempRoot, 'artifacts', 'story.copy.capture.json');

    const capture = await captureWorkflow({
      capability: 'story.copy',
      tenantUrl: 'https://tenant.example.invalid',
      page,
      workflow: {
        actor: 'browser',
        label: 'copy a story from the SAC file browser'
      },
      context: {
        objectType: 'story',
        objectId: 'story-123'
      },
      artifactPath,
      timeoutMs: 4321,
      matchResponse: (candidate) => candidate.request().url().includes('/contentlib?tenant=J'),
      perform: async () => {
        page.setCurrentUrl('https://tenant.example.invalid/sap/fpa/ui/app.html#/story&/edit/story-copy-456');
      }
    });

    expect(workflowCaptureSchema.parse(capture)).toEqual(capture);
    expect(capture).toMatchObject({
      capability: 'story.copy',
      route: {
        before: '#/stories',
        after: '#/story&/edit/story-copy-456'
      },
      runtimeContext: {
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        tenantId: 'J',
        route: '#/story&/edit/story-copy-456',
        csrfTokenPresent: true,
        context: {
          tenantDescription: 'Tenant Description',
          objectType: 'story',
          objectId: 'story-123'
        }
      },
      request: {
        method: 'POST',
        url: '/sap/fpa/services/rest/epm/contentlib?tenant=J',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json;charset=UTF-8'
        },
        body: {
          action: 'copyResource',
          id: 'story-123'
        }
      },
      response: {
        status: 200,
        headers: {
          'content-type': 'application/json'
        },
        body: {
          id: 'story-copy-456',
          ok: true
        }
      },
      evidence: {
        source: 'browser-capture',
        redactions: [],
        notes: []
      },
      volatility: {
        baseline: 'exact-capture',
        patchStrategy: expect.stringContaining('Preserve the exact winning browser payload'),
        patchPaths: [],
        volatilePaths: ['$..capturedAt'],
        stablePaths: [],
        notes: []
      }
    });
    expect(Date.parse(capture.capturedAt)).not.toBeNaN();

    const artifact = workflowCaptureSchema.parse(JSON.parse(await readFile(artifactPath, 'utf8')));
    expect(artifact).toEqual(capture);
  });

  it('redacts sensitive headers, secret-like body fields, and tenant hostnames from persisted captures', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({
        authorization: 'Bearer super-secret',
        cookie: 'SESSION=abc123',
        'content-type': 'application/json;charset=UTF-8',
        'x-csrf-token': 'csrf-secret'
      }),
      postData: () => JSON.stringify({
        token: 'top-secret',
        nested: {
          tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html'
        }
      })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({
        'content-type': 'application/json',
        'set-cookie': 'SESSION=xyz789'
      }),
      text: () => Promise.resolve(JSON.stringify({
        csrfToken: 'response-secret',
        redirect: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html#/home'
      })),
      request: () => request
    };
    const page = createMockCapturePage({
      response,
      runtimeContext: {
        tenantId: 'J',
        csrfToken: 'csrf-token',
        tenantDescription: 'Decision Inc Tenant'
      }
    });

    const capture = await captureWorkflow({
      capability: 'dataaction.validate',
      tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap',
      page,
      workflow: {
        actor: 'browser',
        label: 'validate a data action'
      },
      timeoutMs: 4321,
      matchResponse: () => true,
      perform: async () => undefined
    });

    expect(capture.runtimeContext.tenantUrl).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html');
    expect(capture.request.headers).toMatchObject({
      authorization: 'REDACTED_HEADER',
      cookie: 'REDACTED_HEADER',
      'x-csrf-token': 'REDACTED_HEADER'
    });
    expect(capture.request.body).toEqual({
      token: 'REDACTED_SECRET',
      nested: {
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html'
      }
    });
    expect(capture.response.headers).toMatchObject({
      'set-cookie': 'REDACTED_HEADER'
    });
    expect(capture.response.body).toEqual({
      csrfToken: 'REDACTED_SECRET',
      redirect: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/home'
    });
  });

  it('falls back to plain text when the matched response body is not JSON', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({
        'content-type': 'text/plain'
      }),
      postData: () => 'scope=designer'
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({
        'content-type': 'text/plain'
      }),
      text: () => Promise.resolve('validation passed'),
      request: () => request
    };
    const page = createMockCapturePage({ response });

    const capture = await captureWorkflow({
      capability: 'dataaction.validate',
      tenantUrl: 'https://tenant.example.invalid',
      page,
      workflow: {
        actor: 'browser',
        label: 'validate a data action'
      },
      timeoutMs: 4321,
      matchResponse: () => true,
      perform: async () => undefined
    });

    expect(capture.request.body).toBe('scope=designer');
    expect(capture.response.body).toBe('validation passed');
  });

  it('keeps the live tenant description even when caller context includes the same key', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({ accept: 'application/json' }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({ response });

    const capture = await captureWorkflow({
      capability: 'dataaction.validate',
      tenantUrl: 'https://tenant.example.invalid',
      page,
      workflow: {
        actor: 'browser',
        label: 'validate a data action'
      },
      context: {
        tenantDescription: 'Manual Override',
        objectType: 'data-action'
      },
      timeoutMs: 4321,
      matchResponse: () => true,
      perform: async () => undefined
    });

    expect(capture.runtimeContext.context).toEqual({
      tenantDescription: 'Tenant Description',
      objectType: 'data-action'
    });
  });

  it('does not relabel perform-step failures as capture timeouts just because the message contains timeout-like text', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({ accept: 'application/json' }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({ response });
    page.waitForResponse = vi.fn().mockImplementation(
      () => new Promise<BrowserResponse>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout 4321ms exceeded while waiting for event "response"')), 250);
      })
    );
    const performError = new Error('timed out waiting for selector #copy-button');
    const startedAt = Date.now();

    await expect(
      captureWorkflow({
        capability: 'story.copy',
        tenantUrl: 'https://tenant.example.invalid',
        page,
        workflow: {
          actor: 'browser',
          label: 'copy a story'
        },
        timeoutMs: 4321,
        matchResponse: () => true,
        perform: async () => {
          throw performError;
        }
      })
    ).rejects.toBe(performError);

    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  it('times out promptly even when the perform step outlives timeoutMs', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({ accept: 'application/json' }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({ response });
    page.waitForResponse = vi.fn().mockImplementation(
      () => new Promise<BrowserResponse>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout 100ms exceeded while waiting for event "response"')), 100);
      })
    );
    const startedAt = Date.now();

    await expect(
      captureWorkflow({
        capability: 'story.copy',
        tenantUrl: 'https://tenant.example.invalid',
        page,
        workflow: {
          actor: 'browser',
          label: 'copy a story'
        },
        timeoutMs: 100,
        matchResponse: () => true,
        perform: async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      })
    ).rejects.toMatchObject({
      code: 'WORKFLOW_CAPTURE_TIMEOUT',
      exitCode: ExitCode.GeneralError
    });

    expect(Date.now() - startedAt).toBeLessThan(200);
  });

  it('surfaces early non-timeout response waiter failures instead of masking them as capture timeouts', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({ accept: 'application/json' }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({ response });
    const waiterError = new Error('page closed');
    page.waitForResponse = vi.fn().mockRejectedValue(waiterError);

    await expect(
      captureWorkflow({
        capability: 'story.copy',
        tenantUrl: 'https://tenant.example.invalid',
        page,
        workflow: {
          actor: 'browser',
          label: 'copy a story'
        },
        timeoutMs: 100,
        matchResponse: () => true,
        perform: async () => {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      })
    ).rejects.toBe(waiterError);
  });

  it('bounds runtime-context reads by the capture timeout budget', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({ accept: 'application/json' }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({ response, runtimeContext: {
      tenantId: 'J',
      csrfToken: 'csrf-token',
      tenantDescription: 'Tenant Description'
    } });
    page.evaluate = vi.fn().mockResolvedValue({
      tenantId: null,
      csrfToken: null,
      tenantDescription: null
    });
    const startedAt = Date.now();

    await expect(
      captureWorkflow({
        capability: 'dataaction.validate',
        tenantUrl: 'https://tenant.example.invalid',
        page,
        workflow: {
          actor: 'browser',
          label: 'validate a data action'
        },
        timeoutMs: 100,
        matchResponse: () => true,
        perform: async () => undefined
      })
    ).rejects.toMatchObject({
      code: 'SAC_RUNTIME_CONTEXT_UNAVAILABLE',
      exitCode: ExitCode.GeneralError
    });

    expect(Date.now() - startedAt).toBeLessThan(300);
  });

  it('fails clearly when the browser capture times out', async () => {
    const request: BrowserRequest = {
      method: () => 'POST',
      url: () => 'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: () => ({
        accept: 'application/json'
      }),
      postData: () => JSON.stringify({ action: 'validate' })
    };
    const response: BrowserResponse = {
      status: () => 200,
      headers: () => ({
        'content-type': 'application/json'
      }),
      text: () => Promise.resolve(JSON.stringify({ ok: true })),
      request: () => request
    };
    const page = createMockCapturePage({
      response,
      timeoutError: new Error('Timeout 4321ms exceeded while waiting for event "response"')
    });

    await expect(
      captureWorkflow({
        capability: 'dataaction.validate',
        tenantUrl: 'https://tenant.example.invalid',
        page,
        workflow: {
          actor: 'browser',
          label: 'validate a data action'
        },
        timeoutMs: 4321,
        matchResponse: () => true,
        perform: async () => undefined
      })
    ).rejects.toMatchObject({
      code: 'WORKFLOW_CAPTURE_TIMEOUT',
      exitCode: ExitCode.GeneralError,
      message: expect.stringContaining('Timed out waiting for a matching browser response while capturing "dataaction.validate"')
    });
  });
});
