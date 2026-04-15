import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureSacAppUrl, launchPersistentBrowserSession, resolvePlaywrightChannel } from '../../src/session/browser-session.js';
import type { BrowserRuntime } from '../../src/session/browser-session.js';

describe('browser session helpers', () => {
  it('maps supported browser channels to Playwright launch channels', () => {
    expect(resolvePlaywrightChannel('chrome')).toBe('chrome');
    expect(resolvePlaywrightChannel('msedge')).toBe('msedge');
    expect(resolvePlaywrightChannel('chromium')).toBeUndefined();
  });

  it('normalizes tenant urls to the SAC app route', () => {
    expect(ensureSacAppUrl('https://decisioninc-1.eu10.hcs.cloud.sap')).toBe('https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html');
    expect(ensureSacAppUrl('https://decisioninc-1.eu10.hcs.cloud.sap/')).toBe('https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html');
    expect(ensureSacAppUrl('https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html')).toBe('https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html');
  });

  it('launches a headed persistent context and reuses the first page', async () => {
    const screenshot = vi.fn().mockResolvedValue(undefined);
    const existingPage = {
      screenshot,
      goto: vi.fn(),
      url: () => 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html'
    };
    const newPage = {
      screenshot: vi.fn(),
      goto: vi.fn(),
      url: () => 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html'
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const launchPersistentContext = vi.fn().mockResolvedValue({
      pages: () => [existingPage],
      newPage: vi.fn().mockResolvedValue(newPage),
      close
    });

    const runtime: BrowserRuntime = {
      chromium: {
        launchPersistentContext
      }
    };

    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-browser-'));
    const userDataDir = path.join(root, 'profile', 'browser');

    const session = await launchPersistentBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html',
        defaultAccount: 'e.tanev@decisioninc.com',
        browserChannel: 'chrome',
        userDataDir,
        defaultEvidenceDir: path.join(root, 'profile', 'evidence')
      },
      runtime
    );

    expect(launchPersistentContext).toHaveBeenCalledWith(userDataDir, {
      channel: 'chrome',
      headless: false
    });
    expect(session.page).toBe(existingPage);

    const screenshotPath = path.join(root, 'shots', 'login.png');
    await session.takeScreenshot(screenshotPath);
    expect(screenshot).toHaveBeenCalledWith({ path: screenshotPath, fullPage: true });

    await session.close();
    expect(close).toHaveBeenCalled();
  });
});
