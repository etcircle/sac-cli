import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { ensureSacAppUrl, type BrowserPage } from './browser-session.js';

export type PageFetchJsonRequest = {
  page: BrowserPage;
  tenantUrl: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type SacRuntimeContext = {
  tenantId: string;
  csrfToken: string | null;
  tenantDescription: string | null;
};

function isRetryablePageEvaluateError(error: unknown): boolean {
  return error instanceof Error
    && /execution context was destroyed/i.test(error.message);
}

export async function readSacRuntimeContext(
  page: BrowserPage,
  fallbackTenantId?: string,
  options: { requireCsrfToken?: boolean; timeoutMs?: number } = {}
): Promise<SacRuntimeContext> {
  if (!page.evaluate) {
    throw new CliError(
      'PAGE_FETCH_UNAVAILABLE',
      'The browser page does not expose evaluate(); page-context fetch cannot run.',
      ExitCode.GeneralError
    );
  }

  const timeoutMs = options.timeoutMs ?? 10000;
  const deadline = Date.now() + timeoutMs;
  let runtimeContext: { tenantId: string | null; csrfToken: string | null; tenantDescription: string | null } | null = null;

  while (Date.now() <= deadline) {
    try {
      runtimeContext = await page.evaluate((input) => {
        const runtimeGlobal = globalThis as typeof globalThis & {
          TENANT?: string;
          TENANT_DESC?: string;
          FPA_CSRF_TOKEN?: string;
          FPA_SESSION?: {
            tenant?: Array<{ id?: string; description?: string }>;
          };
        };
        const tenantFromSession = runtimeGlobal.FPA_SESSION?.tenant?.[0]?.id || null;
        const descriptionFromSession = runtimeGlobal.FPA_SESSION?.tenant?.[0]?.description || null;
        return {
          tenantId: runtimeGlobal.TENANT || tenantFromSession || input.fallbackTenantId || null,
          csrfToken: runtimeGlobal.FPA_CSRF_TOKEN || null,
          tenantDescription: runtimeGlobal.TENANT_DESC || descriptionFromSession || null
        };
      }, { fallbackTenantId: fallbackTenantId ?? null });
    } catch (error) {
      if (!isRetryablePageEvaluateError(error) || Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    if (runtimeContext?.tenantId && (!options.requireCsrfToken || runtimeContext.csrfToken)) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!runtimeContext?.tenantId) {
    throw new CliError(
      'SAC_RUNTIME_CONTEXT_UNAVAILABLE',
      'Could not resolve the live SAC tenant id from the browser session.',
      ExitCode.GeneralError
    );
  }

  if (options.requireCsrfToken && !runtimeContext.csrfToken) {
    throw new CliError(
      'SAC_CSRF_TOKEN_UNAVAILABLE',
      'Could not resolve the live SAC CSRF token from the browser session.',
      ExitCode.GeneralError
    );
  }

  return {
    tenantId: runtimeContext.tenantId,
    csrfToken: runtimeContext.csrfToken ?? null,
    tenantDescription: runtimeContext.tenantDescription ?? null
  };
}

export async function pageFetchJson<Response>(input: PageFetchJsonRequest): Promise<Response> {
  if (!input.page.evaluate) {
    throw new CliError(
      'PAGE_FETCH_UNAVAILABLE',
      'The browser page does not expose evaluate(); page-context fetch cannot run.',
      ExitCode.GeneralError
    );
  }

  const url = new URL(input.path, ensureSacAppUrl(input.tenantUrl)).toString();

  return input.page.evaluate(
    async (request) => {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body)
      });

      if (!response.ok) {
        const statusText = typeof response.statusText === 'string' && response.statusText.length > 0
          ? ` ${response.statusText}`
          : '';
        const failureText = typeof response.text === 'function'
          ? String(await response.text()).trim()
          : '';
        const failureSuffix = failureText ? `: ${failureText}` : '';
        throw new Error(`Page fetch failed with HTTP ${response.status}${statusText}${failureSuffix}`);
      }

      try {
        return await response.json() as Response;
      } catch {
        throw new Error('Page fetch returned a non-JSON success response.');
      }
    },
    {
      url,
      method: input.method,
      headers: input.headers ?? {},
      body: input.body
    }
  );
}
