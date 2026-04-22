import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  attachToBrowserSession,
  ensureSacAppShell,
  ensureSacAppUrl,
  isLikelySacLoginUrl,
  isSacAppUrl,
  launchPersistentBrowserSession,
  openManagedBrowserSession,
  openSacRoute,
  resolvePlaywrightChannel
} from '../../src/session/browser-session.js';
import type { BrowserRuntime } from '../../src/session/browser-session.js';

describe('browser session helpers', () => {
  it('maps supported browser channels to Playwright launch channels', () => {
    expect(resolvePlaywrightChannel('chrome')).toBe('chrome');
    expect(resolvePlaywrightChannel('msedge')).toBe('msedge');
    expect(resolvePlaywrightChannel('chromium')).toBeUndefined();
  });

  it('normalizes tenant urls to the SAC app route', () => {
    expect(ensureSacAppUrl('https://tenant.example.invalid')).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html');
    expect(ensureSacAppUrl('https://tenant.example.invalid/')).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html');
    expect(ensureSacAppUrl('https://tenant.example.invalid/sap/fpa/ui/app.html')).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html');
    expect(ensureSacAppUrl('https://tenant.example.invalid/sap/fpa/ui/app.html#/dataaction&/da/ABC')).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html');
  });

  it('recognizes SAC app urls and auth redirects', () => {
    expect(isSacAppUrl(
      'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit',
      'https://tenant.example.invalid/sap/fpa/ui/app.html'
    )).toBe(true);
    expect(isSacAppUrl(
      'https://tenant.example.invalid/other',
      'https://tenant.example.invalid/sap/fpa/ui/app.html'
    )).toBe(false);
    expect(isLikelySacLoginUrl(
      'https://tenant.authentication.example.invalid/saml/login/alias/example?idp=foo'
    )).toBe(true);
    expect(isLikelySacLoginUrl(
      'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC'
    )).toBe(false);
  });

  it('bootstraps the SAC app shell before deep route work when starting outside the shell', async () => {
    const goto = vi.fn().mockImplementation(async (targetUrl) => {
      currentUrl = targetUrl;
    });
    let currentUrl = 'about:blank';
    const page = {
      goto,
      url: () => currentUrl,
      screenshot: vi.fn()
    };

    await expect(
      ensureSacAppShell(page, 'https://tenant.example.invalid/sap/fpa/ui/app.html#/dataaction&/da/ABC')
    ).resolves.toBe('goto-app-shell');
    expect(goto).toHaveBeenCalledWith(
      'https://tenant.example.invalid/sap/fpa/ui/app.html',
      { waitUntil: 'domcontentloaded' }
    );
  });

  it('does not reload when already inside the SAC app shell', async () => {
    const goto = vi.fn();
    const page = {
      goto,
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html#/files',
      screenshot: vi.fn(),
      evaluate: vi.fn()
    };

    await expect(
      ensureSacAppShell(page, 'https://tenant.example.invalid/sap/fpa/ui/app.html#/dataaction&/da/ABC')
    ).resolves.toBe('already-in-shell');
    expect(goto).not.toHaveBeenCalled();
  });

  it('reuses hash navigation when already inside the SAC app shell', async () => {
    const goto = vi.fn();
    let currentUrl = 'https://tenant.example.invalid/sap/fpa/ui/app.html#/files';
    const page = {
      goto,
      url: () => currentUrl,
      screenshot: vi.fn(),
      evaluate: vi.fn(async (_pageFunction, arg) => {
        currentUrl = `https://tenant.example.invalid/sap/fpa/ui/app.html${arg.hash}`;
        return null;
      })
    } as any;

    await expect(
      openSacRoute(page, 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit')
    ).resolves.toBe('reused-hash-route');
    expect(goto).not.toHaveBeenCalled();
    expect(currentUrl).toBe('https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit');
  });

  it('fails clearly when the saved browser session is sitting on a login redirect', async () => {
    const page = {
      goto: vi.fn(),
      url: () => 'https://tenant.authentication.example.invalid/saml/login/alias/example',
      screenshot: vi.fn(),
      evaluate: vi.fn()
    };

    await expect(
      openSacRoute(page, 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit')
    ).rejects.toThrow(/requires interactive login/i);
  });

  it('hard-navigates when not already inside the SAC app shell', async () => {
    const goto = vi.fn().mockImplementation(async (targetUrl) => {
      currentUrl = targetUrl;
    });
    let currentUrl = 'about:blank';
    const page = {
      goto,
      url: () => currentUrl,
      screenshot: vi.fn()
    };

    await expect(
      openSacRoute(page, 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit')
    ).resolves.toBe('goto');
    expect(goto).toHaveBeenCalledWith(
      'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?mode=edit',
      { waitUntil: 'domcontentloaded' }
    );
  });

  it('attaches over CDP when debug url is provided', async () => {
    const attachedPage = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const existingPage = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html#/files'
    };
    const context = {
      pages: () => [existingPage],
      newPage: vi.fn().mockResolvedValue(attachedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined)
    };
    const connectOverCDP = vi.fn().mockResolvedValue(browser);

    const session = await attachToBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence',
        remoteDebuggingUrl: 'http://127.0.0.1:9222'
      },
      {
        chromium: {
          launchPersistentContext: vi.fn(),
          connectOverCDP
        }
      } as unknown as BrowserRuntime
    );

    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9222');
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(session.context).toBe(context);
    expect(session.page).toBe(attachedPage);
  });

  it('session.close closes only the fresh attached page and disconnects CDP', async () => {
    const existingPage = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html#/files'
    };
    const attachedPage = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const context = {
      pages: () => [existingPage],
      newPage: vi.fn().mockResolvedValue(attachedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const browser = {
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined)
    };

    const session = await attachToBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence',
        remoteDebuggingUrl: 'http://127.0.0.1:9222'
      },
      {
        chromium: {
          launchPersistentContext: vi.fn(),
          connectOverCDP: vi.fn().mockResolvedValue(browser)
        }
      } as unknown as BrowserRuntime
    );

    await session.close();

    expect(session.page).toBe(attachedPage);
    expect(attachedPage.close).toHaveBeenCalledTimes(1);
    expect(existingPage.close).not.toHaveBeenCalled();
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when attach mode is requested without a debug url', async () => {
    await expect(
      attachToBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence'
        },
        {
          chromium: {
            launchPersistentContext: vi.fn(),
            connectOverCDP: vi.fn()
          }
        } as unknown as BrowserRuntime
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_REQUIRED',
      message: 'Attach mode needs a browser CDP debug URL. Pass --browser-debug-url http://127.0.0.1:9333 or set profile.remoteDebuggingUrl before retrying.'
    });
  });

  it('fails clearly when the attached browser exposes no contexts and disconnects the CDP session', async () => {
    const browserClose = vi.fn().mockResolvedValue(undefined);

    await expect(
      attachToBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence',
          remoteDebuggingUrl: 'http://127.0.0.1:9222'
        },
        {
          chromium: {
            launchPersistentContext: vi.fn(),
            connectOverCDP: vi.fn().mockResolvedValue({
              contexts: () => [],
              close: browserClose
            })
          }
        } as unknown as BrowserRuntime
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_CONTEXT_MISSING',
      message: 'Connected to the browser at http://127.0.0.1:9222, but it exposed no reusable browser contexts. Keep the target browser window open and confirm the CDP endpoint belongs to your interactive profile.'
    });

    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when CDP attach support is unavailable in the runtime', async () => {
    await expect(
      attachToBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence',
          remoteDebuggingUrl: 'http://127.0.0.1:9222'
        },
        {
          chromium: {
            launchPersistentContext: vi.fn()
          }
        } as unknown as BrowserRuntime
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_UNAVAILABLE',
      message: 'This sac-cli runtime cannot attach to an existing browser because chromium.connectOverCDP is unavailable. Use launch mode or run a build with CDP attach support.'
    });
  });

  it('fails clearly when CDP attach rejects', async () => {
    await expect(
      attachToBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence',
          remoteDebuggingUrl: 'http://127.0.0.1:9222'
        },
        {
          chromium: {
            launchPersistentContext: vi.fn(),
            connectOverCDP: vi.fn().mockRejectedValue(new Error('cdp refused'))
          }
        } as unknown as BrowserRuntime
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_FAILED',
      message: 'Could not attach to the existing browser at http://127.0.0.1:9222. Make sure Chrome or Edge is already running with remote debugging enabled, then retry. cdp refused'
    });
  });

  it('fails clearly when an attached context cannot open a fresh page and disconnects the CDP session', async () => {
    const browserClose = vi.fn().mockResolvedValue(undefined);

    await expect(
      attachToBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence',
          remoteDebuggingUrl: 'http://127.0.0.1:9222'
        },
        {
          chromium: {
            launchPersistentContext: vi.fn(),
            connectOverCDP: vi.fn().mockResolvedValue({
              contexts: () => [{
                pages: () => [],
                newPage: vi.fn().mockRejectedValue(new Error('Target page, context or browser has been closed')),
                close: vi.fn().mockResolvedValue(undefined)
              }],
              close: browserClose
            })
          }
        } as unknown as BrowserRuntime
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_PAGE_FAILED',
      message: 'Connected to the browser at http://127.0.0.1:9222, but could not open a fresh page in the reused context. Keep the shared browser window alive and retry the attach target. Target page, context or browser has been closed'
    });

    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it('attach-first chooses CDP when a debug url is available and does not launch', async () => {
    const attachedPageClose = vi.fn().mockResolvedValue(undefined);
    const attachedPage = {
      close: attachedPageClose,
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'about:blank'
    };
    const attachedContext = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(attachedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const browserClose = vi.fn().mockResolvedValue(undefined);
    const connectOverCDP = vi.fn().mockResolvedValue({
      contexts: () => [attachedContext],
      close: browserClose
    });
    const launchPersistentContext = vi.fn();

    const session = await openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-first',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).not.toHaveBeenCalled();
    expect(session.page).toBe(attachedPage);

    await session.close();
    expect(attachedPageClose).toHaveBeenCalledTimes(1);
    expect(attachedContext.close).not.toHaveBeenCalled();
    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it('attach-first falls back to launch when CDP attach fails', async () => {
    const launchedPage = {
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const launchedContext = {
      pages: () => [launchedPage],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const connectOverCDP = vi.fn().mockRejectedValue(new Error('cdp refused'));
    const launchPersistentContext = vi.fn().mockResolvedValue(launchedContext);

    const session = await openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-first',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).toHaveBeenCalledWith('/tmp/unused', {
      channel: 'chrome',
      headless: false
    });
    expect(session.page).toBe(launchedPage);
  });

  it('attach-first falls back to launch when CDP attach support is unavailable', async () => {
    const launchedPage = {
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const launchedContext = {
      pages: () => [launchedPage],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const launchPersistentContext = vi.fn().mockResolvedValue(launchedContext);

    const session = await openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext
        }
      } as unknown as BrowserRuntime,
      {
        attachMode: 'attach-first',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    expect(launchPersistentContext).toHaveBeenCalledWith('/tmp/unused', {
      channel: 'chrome',
      headless: false
    });
    expect(session.page).toBe(launchedPage);
  });

  it('attach-first does not fall back when the attached browser exposes no contexts', async () => {
    const launchPersistentContext = vi.fn();

    await expect(
      openManagedBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence'
        },
        {
          chromium: {
            launchPersistentContext,
            connectOverCDP: vi.fn().mockResolvedValue({
              contexts: () => [],
              close: vi.fn().mockResolvedValue(undefined)
            })
          }
        },
        {
          attachMode: 'attach-first',
          browserDebugUrl: 'http://127.0.0.1:9333'
        }
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_CONTEXT_MISSING',
      message: 'Connected to the browser at http://127.0.0.1:9333, but it exposed no reusable browser contexts. Keep the target browser window open and confirm the CDP endpoint belongs to your interactive profile.'
    });
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it('attach-first does not fall back when the reused context cannot open a fresh page', async () => {
    const launchPersistentContext = vi.fn();

    await expect(
      openManagedBrowserSession(
        {
          name: 'sandbox',
          tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
          defaultAccount: 'sandbox@example.invalid',
          browserChannel: 'chrome',
          userDataDir: '/tmp/unused',
          defaultEvidenceDir: '/tmp/evidence'
        },
        {
          chromium: {
            launchPersistentContext,
            connectOverCDP: vi.fn().mockResolvedValue({
              contexts: () => [{
                pages: () => [],
                newPage: vi.fn().mockRejectedValue(new Error('Target page, context or browser has been closed')),
                close: vi.fn().mockResolvedValue(undefined)
              }],
              close: vi.fn().mockResolvedValue(undefined)
            })
          }
        },
        {
          attachMode: 'attach-first',
          browserDebugUrl: 'http://127.0.0.1:9333'
        }
      )
    ).rejects.toMatchObject({
      code: 'BROWSER_ATTACH_PAGE_FAILED',
      message: 'Connected to the browser at http://127.0.0.1:9333, but could not open a fresh page in the reused context. Keep the shared browser window alive and retry the attach target. Target page, context or browser has been closed'
    });
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it('attach-only fails clearly instead of launching a new browser', async () => {
    const launchPersistentContext = vi.fn();
    const connectOverCDP = vi.fn();

    const attachAttempt = openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-only'
      }
    );

    const error = await attachAttempt.catch((attachError) => attachError);

    expect(error).toMatchObject({
      code: 'BROWSER_ATTACH_REQUIRED',
      message: 'Attach mode needs a browser CDP debug URL. Pass --browser-debug-url http://127.0.0.1:9333 or set profile.remoteDebuggingUrl before retrying.'
    });
    expect(error).not.toMatchObject({
      code: 'INTERACTIVE_LOGIN_REQUIRED'
    });
    expect(connectOverCDP).not.toHaveBeenCalled();
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it('attach-only surfaces CDP connect refusals without launch fallback', async () => {
    const launchPersistentContext = vi.fn();
    const connectOverCDP = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9333'));

    const attachAttempt = openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-only',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    const error = await attachAttempt.catch((attachError) => attachError);

    expect(error).toMatchObject({
      code: 'BROWSER_ATTACH_FAILED',
      message: 'Could not attach to the existing browser at http://127.0.0.1:9333. Make sure Chrome or Edge is already running with remote debugging enabled, then retry. connect ECONNREFUSED 127.0.0.1:9333'
    });
    expect(error).not.toMatchObject({
      code: 'INTERACTIVE_LOGIN_REQUIRED'
    });
    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it('attach-only surfaces missing reusable contexts without launch fallback', async () => {
    const launchPersistentContext = vi.fn();
    const connectOverCDP = vi.fn().mockResolvedValue({
      contexts: () => [],
      close: vi.fn().mockResolvedValue(undefined)
    });

    const attachAttempt = openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-only',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    const error = await attachAttempt.catch((attachError) => attachError);

    expect(error).toMatchObject({
      code: 'BROWSER_ATTACH_CONTEXT_MISSING',
      message: 'Connected to the browser at http://127.0.0.1:9333, but it exposed no reusable browser contexts. Keep the target browser window open and confirm the CDP endpoint belongs to your interactive profile.'
    });
    expect(error).not.toMatchObject({
      code: 'INTERACTIVE_LOGIN_REQUIRED'
    });
    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).not.toHaveBeenCalled();
  });

  it('launch mode still launches a persistent context', async () => {
    const launchedPage = {
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const launchedContext = {
      pages: () => [launchedPage],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const launchPersistentContext = vi.fn().mockResolvedValue(launchedContext);
    const connectOverCDP = vi.fn();

    const session = await openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence',
        browserAttachMode: 'attach-only',
        remoteDebuggingUrl: 'http://127.0.0.1:9222'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'launch'
      }
    );

    expect(connectOverCDP).not.toHaveBeenCalled();
    expect(launchPersistentContext).toHaveBeenCalledWith('/tmp/unused', {
      channel: 'chrome',
      headless: false
    });
    expect(session.page).toBe(launchedPage);
  });

  it('CLI attach options override profile attach settings when opening a managed session', async () => {
    const attachedPage = {
      close: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn(),
      screenshot: vi.fn(),
      url: () => 'about:blank'
    };
    const attachedContext = {
      pages: () => [],
      newPage: vi.fn().mockResolvedValue(attachedPage),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const connectOverCDP = vi.fn().mockResolvedValue({
      contexts: () => [attachedContext],
      close: vi.fn().mockResolvedValue(undefined)
    });
    const launchPersistentContext = vi.fn();

    const session = await openManagedBrowserSession(
      {
        name: 'sandbox',
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
        browserChannel: 'chrome',
        userDataDir: '/tmp/unused',
        defaultEvidenceDir: '/tmp/evidence',
        browserAttachMode: 'launch',
        remoteDebuggingUrl: 'http://127.0.0.1:9222'
      },
      {
        chromium: {
          launchPersistentContext,
          connectOverCDP
        }
      },
      {
        attachMode: 'attach-only',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).not.toHaveBeenCalled();
    expect(session.page).toBe(attachedPage);
  });

  it('launches a headed persistent context and reuses the first page', async () => {
    const screenshot = vi.fn().mockResolvedValue(undefined);
    const existingPage = {
      screenshot,
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
    };
    const newPage = {
      screenshot: vi.fn(),
      goto: vi.fn(),
      url: () => 'https://tenant.example.invalid/sap/fpa/ui/app.html'
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
        tenantUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html',
        defaultAccount: 'sandbox@example.invalid',
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
