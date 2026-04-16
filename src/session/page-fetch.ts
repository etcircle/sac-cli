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
