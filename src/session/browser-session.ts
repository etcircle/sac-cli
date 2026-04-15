import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserChannel, SacCliProfile } from '../config/schema.js';

export type BrowserPage = {
  goto(url: string, options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' }): Promise<unknown>;
  url(): string;
  screenshot(options: { path: string; fullPage?: boolean }): Promise<unknown>;
};

export type BrowserContext = {
  pages(): BrowserPage[];
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
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
  if (normalizedUrl.pathname === '/sap/fpa/ui/app.html') {
    return normalizedUrl.toString();
  }

  return new URL('/sap/fpa/ui/app.html', normalizedUrl).toString();
}

export async function createDefaultBrowserRuntime(): Promise<BrowserRuntime> {
  const playwright = await import('playwright-core');
  return {
    chromium: {
      launchPersistentContext: playwright.chromium.launchPersistentContext.bind(playwright.chromium)
    }
  };
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
