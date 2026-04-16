import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageFetchJson, readSacRuntimeContext } from '../../src/session/page-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('page fetch helper', () => {
  it('reads runtime tenant and csrf context from the live page', async () => {
    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
      screenshot: vi.fn(),
      evaluate: vi.fn().mockResolvedValue({
        tenantId: 'J',
        csrfToken: 'csrf-token',
        tenantDescription: '9AA1C'
      })
    };

    await expect(readSacRuntimeContext(page, 'EXAMPLE')).resolves.toEqual({
      tenantId: 'J',
      csrfToken: 'csrf-token',
      tenantDescription: '9AA1C'
    });
  });

  it('falls back to the provided tenant id when the page globals are missing', async () => {
    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
      screenshot: vi.fn(),
      evaluate: vi.fn().mockResolvedValue({
        tenantId: 'EXAMPLE',
        csrfToken: null,
        tenantDescription: null
      })
    };

    await expect(readSacRuntimeContext(page, 'EXAMPLE')).resolves.toEqual({
      tenantId: 'EXAMPLE',
      csrfToken: null,
      tenantDescription: null
    });
  });

  it('executes fetch through page.evaluate and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, source: 'page-context' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
      screenshot: vi.fn(),
      evaluate: vi.fn(async (pageFunction, arg) => pageFunction(arg))
    };

    const result = await pageFetchJson<{ ok: boolean; source: string }>({
      page,
      tenantUrl: 'https://tenant.example.invalid',
      method: 'POST',
      path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: {
        action: 'readObject'
      }
    });

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tenant.example.invalid/sap/fpa/services/rest/epm/objectmgr?tenant=J',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json;charset=UTF-8',
          'x-requested-with': 'XMLHttpRequest'
        },
        body: JSON.stringify({ action: 'readObject' })
      }
    );
    expect(result).toEqual({ ok: true, source: 'page-context' });
  });

  it('fails clearly when a success response does not contain JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      }
    });
    vi.stubGlobal('fetch', fetchMock);

    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
      screenshot: vi.fn(),
      evaluate: vi.fn(async (pageFunction, arg) => pageFunction(arg))
    };

    await expect(
      pageFetchJson({
        page,
        tenantUrl: 'https://tenant.example.invalid',
        method: 'POST',
        path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J'
      })
    ).rejects.toThrow(/non-json success response/i);
  });

  it('fails clearly when the page does not expose evaluate()', async () => {
    await expect(
      pageFetchJson({
        page: {
          goto: vi.fn(),
          url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          screenshot: vi.fn()
        },
        tenantUrl: 'https://tenant.example.invalid',
        method: 'POST',
        path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J'
      })
    ).rejects.toThrow(/does not expose evaluate/i);
  });

  it('surfaces HTTP failures before attempting JSON parsing', async () => {
    const json = vi.fn().mockRejectedValue(new Error('json should not be called'));
    const text = vi.fn().mockResolvedValue('tenant said no');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text,
      json
    });
    vi.stubGlobal('fetch', fetchMock);

    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html',
      screenshot: vi.fn(),
      evaluate: vi.fn(async (pageFunction, arg) => pageFunction(arg))
    };

    await expect(
      pageFetchJson({
        page,
        tenantUrl: 'https://tenant.example.invalid',
        method: 'GET',
        path: '/sap/fpa/services/rest/epm/objectmgr?tenant=J'
      })
    ).rejects.toThrow(/HTTP 403 Forbidden: tenant said no/);

    expect(text).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });
});
