import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import type { BrowserAttachMode, BrowserChannel, SacCliProfile } from '../config/schema.js';

export type BrowserPage = {
  goto(url: string, options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' }): Promise<unknown>;
  url(): string;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>;
  close?(): Promise<void>;
  evaluate?<Result, Arg = undefined>(pageFunction: (arg: Arg) => Result | Promise<Result>, arg: Arg): Promise<Result>;
  waitForRequest?(
    predicate: (request: BrowserRequest) => boolean,
    options?: { timeout?: number }
  ): Promise<BrowserRequest>;
  waitForResponse?(
    predicate: (response: BrowserResponse) => boolean,
    options?: { timeout?: number }
  ): Promise<BrowserResponse>;
};

export type BrowserRequest = {
  method(): string;
  url(): string;
  headers(): Record<string, string>;
  postData(): string | null;
};

export type BrowserResponse = {
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
  request(): BrowserRequest;
};

export type BrowserContext = {
  pages(): BrowserPage[];
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
};

export type Browser = {
  contexts(): BrowserContext[];
  close?(): Promise<void>;
};

export type BrowserRuntime = {
  chromium: {
    launchPersistentContext(
      userDataDir: string,
      options: {
        headless: boolean;
        channel?: 'chrome' | 'msedge';
      }
    ): Promise<BrowserContext>;
    connectOverCDP?(endpoint: string): Promise<Browser>;
  };
};

export type ManagedBrowserSession = {
  context: BrowserContext;
  page: BrowserPage;
  close(): Promise<void>;
  takeScreenshot(outputPath: string): Promise<string>;
};

export function resolvePlaywrightChannel(channel: BrowserChannel): 'chrome' | 'msedge' | undefined {
  if (channel === 'chrome') {
    return 'chrome';
  }

  if (channel === 'msedge') {
    return 'msedge';
  }

  return undefined;
}

export function ensureSacAppUrl(tenantUrl: string): string {
  const normalizedUrl = new URL(tenantUrl);
  normalizedUrl.hash = '';
  if (normalizedUrl.pathname === '/sap/fpa/ui/app.html') {
    return normalizedUrl.toString();
  }

  return new URL('/sap/fpa/ui/app.html', normalizedUrl).toString();
}

export function isSacAppUrl(currentUrl: string, tenantUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const tenantApp = new URL(ensureSacAppUrl(tenantUrl));
    return current.origin === tenantApp.origin && current.pathname === tenantApp.pathname;
  } catch {
    return false;
  }
}

export function isLikelySacLoginUrl(currentUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    return current.pathname.includes('/saml/login')
      || current.pathname.includes('/ui/login')
      || current.pathname.includes('/ui/createForgottenPasswordMail')
      || current.hostname.includes('.authentication.');
  } catch {
    return false;
  }
}

function createInteractiveLoginRequiredError(): CliError {
  return new CliError(
    'INTERACTIVE_LOGIN_REQUIRED',
    'SAC session requires interactive login. Run auth login and complete SSO/MFA in the headed browser.',
    ExitCode.GeneralError
  );
}

function createBrowserAttachError(code: string, message: string): CliError {
  return new CliError(code, message, ExitCode.GeneralError);
}

function formatAttachReason(error: unknown): string {
  return error instanceof Error && error.message ? ` ${error.message}` : '';
}

function isAttachFirstFallbackError(error: unknown): boolean {
  return error instanceof CliError
    && (error.code === 'BROWSER_ATTACH_UNAVAILABLE' || error.code === 'BROWSER_ATTACH_FAILED');
}

export async function ensureSacAppShell(page: BrowserPage, tenantUrl: string): Promise<'already-in-shell' | 'goto-app-shell'> {
  const resolvedAppUrl = ensureSacAppUrl(tenantUrl);
  const currentUrl = page.url();

  if (currentUrl && isLikelySacLoginUrl(currentUrl)) {
    throw createInteractiveLoginRequiredError();
  }

  if (currentUrl && isSacAppUrl(currentUrl, resolvedAppUrl)) {
    return 'already-in-shell';
  }

  await page.goto(resolvedAppUrl, { waitUntil: 'domcontentloaded' });
  if (isLikelySacLoginUrl(page.url())) {
    throw createInteractiveLoginRequiredError();
  }

  return 'goto-app-shell';
}

export async function openSacRoute(page: BrowserPage, targetUrl: string): Promise<'reused-hash-route' | 'goto' | 'already-at-target'> {
  const resolvedTargetUrl = new URL(targetUrl, ensureSacAppUrl(targetUrl)).toString();
  const currentUrl = page.url();

  if (currentUrl === resolvedTargetUrl) {
    return 'already-at-target';
  }

  if (currentUrl && isLikelySacLoginUrl(currentUrl)) {
    throw createInteractiveLoginRequiredError();
  }

  if (currentUrl && isSacAppUrl(currentUrl, resolvedTargetUrl) && page.evaluate) {
    const target = new URL(resolvedTargetUrl);
    const current = new URL(currentUrl);

    if (current.hash !== target.hash) {
      await page.evaluate(function (input) {
        globalThis.location.hash = input.hash;
        return null;
      }, { hash: target.hash });
    }

    return 'reused-hash-route';
  }

  await page.goto(resolvedTargetUrl, { waitUntil: 'domcontentloaded' });
  if (isLikelySacLoginUrl(page.url())) {
    throw createInteractiveLoginRequiredError();
  }
  return 'goto';
}

export async function createDefaultBrowserRuntime(): Promise<BrowserRuntime> {
  const playwright = await import('playwright-core');
  return {
    chromium: {
      launchPersistentContext: playwright.chromium.launchPersistentContext.bind(playwright.chromium),
      connectOverCDP: playwright.chromium.connectOverCDP.bind(playwright.chromium)
    }
  };
}

export async function attachToBrowserSession(
  profile: Pick<SacCliProfile, 'browserChannel' | 'defaultEvidenceDir' | 'defaultAccount' | 'name' | 'tenantUrl' | 'userDataDir'> & {
    remoteDebuggingUrl?: string;
  },
  runtime: BrowserRuntime
): Promise<ManagedBrowserSession> {
  if (!profile.remoteDebuggingUrl) {
    throw createBrowserAttachError(
      'BROWSER_ATTACH_REQUIRED',
      'Attach mode needs a browser CDP debug URL. Pass --browser-debug-url http://127.0.0.1:9333 or set profile.remoteDebuggingUrl before retrying.'
    );
  }

  if (!runtime.chromium.connectOverCDP) {
    throw createBrowserAttachError(
      'BROWSER_ATTACH_UNAVAILABLE',
      'This sac-cli runtime cannot attach to an existing browser because chromium.connectOverCDP is unavailable. Use launch mode or run a build with CDP attach support.'
    );
  }

  let browser: Browser;
  try {
    browser = await runtime.chromium.connectOverCDP(profile.remoteDebuggingUrl);
  } catch (error) {
    throw createBrowserAttachError(
      'BROWSER_ATTACH_FAILED',
      `Could not attach to the existing browser at ${profile.remoteDebuggingUrl}. Make sure Chrome or Edge is already running with remote debugging enabled, then retry.${formatAttachReason(error)}`
    );
  }

  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw createBrowserAttachError(
        'BROWSER_ATTACH_CONTEXT_MISSING',
        `Connected to the browser at ${profile.remoteDebuggingUrl}, but it exposed no reusable browser contexts. Keep the target browser window open and confirm the CDP endpoint belongs to your interactive profile.`
      );
    }

    let page: BrowserPage;
    try {
      page = await context.newPage();
    } catch (error) {
      throw createBrowserAttachError(
        'BROWSER_ATTACH_PAGE_FAILED',
        `Connected to the browser at ${profile.remoteDebuggingUrl}, but could not open a fresh page in the reused context. Keep the shared browser window alive and retry the attach target.${formatAttachReason(error)}`
      );
    }

    return {
      context,
      page,
      // Attached-session teardown only closes the owned page, then disconnects this CDP client.
      // It must not close the shared browser context reused from the external browser profile.
      close: async () => {
        try {
          await page.close?.();
        } finally {
          await browser.close?.();
        }
      },
      takeScreenshot: async (outputPath: string) => {
        await mkdir(path.dirname(outputPath), { recursive: true });
        await page.screenshot({ path: outputPath, fullPage: true });
        return outputPath;
      }
    };
  } catch (error) {
    await browser.close?.().catch(() => undefined);
    throw error;
  }
}

export async function openManagedBrowserSession(
  profile: SacCliProfile,
  runtime: BrowserRuntime,
  options: {
    attachMode?: BrowserAttachMode;
    browserDebugUrl?: string;
  } = {}
): Promise<ManagedBrowserSession> {
  const attachMode = options.attachMode ?? profile.browserAttachMode ?? 'launch';
  const browserDebugUrl = options.browserDebugUrl ?? profile.remoteDebuggingUrl;

  if (attachMode === 'launch') {
    return launchPersistentBrowserSession(profile, runtime);
  }

  const attachProfile = {
    ...profile,
    remoteDebuggingUrl: browserDebugUrl
  };

  if (attachMode === 'attach-only') {
    return attachToBrowserSession(attachProfile, runtime);
  }

  if (browserDebugUrl) {
    try {
      return await attachToBrowserSession(attachProfile, runtime);
    } catch (error) {
      if (!isAttachFirstFallbackError(error)) {
        throw error;
      }
      return launchPersistentBrowserSession(profile, runtime);
    }
  }

  return launchPersistentBrowserSession(profile, runtime);
}

export async function launchPersistentBrowserSession(
  profile: Pick<SacCliProfile, 'browserChannel' | 'defaultEvidenceDir' | 'defaultAccount' | 'name' | 'tenantUrl' | 'userDataDir'>,
  runtime: BrowserRuntime
): Promise<ManagedBrowserSession> {
  await mkdir(profile.userDataDir, { recursive: true });

  const context = await runtime.chromium.launchPersistentContext(profile.userDataDir, {
    headless: false,
    channel: resolvePlaywrightChannel(profile.browserChannel)
  });

  const existingPage = context.pages()[0];
  const page = existingPage ?? await context.newPage();

  return {
    context,
    page,
    close: async () => {
      await context.close();
    },
    takeScreenshot: async (outputPath: string) => {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await page.screenshot({ path: outputPath, fullPage: true });
      return outputPath;
    }
  };
}
