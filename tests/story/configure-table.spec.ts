import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  configureStoryTableFromPilot,
  inspectStoryTableCellMenuFromPilot,
  inspectStoryTableMenuFromPilot,
  inspectStoryTablePropertyGatesFromPilot,
  __testOnly
} from '../../src/story/configure-table.js';
import { writePilotBundle, PILOT_PROFILE_NAME, PILOT_RUNTIME_TENANT_URL } from '../helpers/pilot-bundle.js';

describe('member selector helper', () => {
  it('builds a story session factory that forwards attach options into session acquisition', async () => {
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

    const sessionFactory = await __testOnly.createSessionFactory({
      chromium: {
        launchPersistentContext,
        connectOverCDP
      }
    });

    const session = await sessionFactory(
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
        attachMode: 'attach-only',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );

    expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
    expect(launchPersistentContext).not.toHaveBeenCalled();
    expect(session.page).toBe(attachedPage);
  });

  it('targets the nested SAP checkbox button for a member row instead of the row label text', () => {
    const plan = __testOnly.buildMemberSelectorPlan({
      title: 'Set Filters for Version',
      clearSelection: { x: 12, y: 24 },
      okButton: { x: 320, y: 440 },
      selectedMembersText: 'Selected Members Actual',
      availableRows: [
        {
          text: 'ID: public.Actual Display Name: Actual',
          checkboxButton: { x: 50, y: 90 },
          labelCenter: { x: 140, y: 90 }
        },
        {
          text: 'ID: public.Forecast Display Name: Forecast',
          checkboxButton: { x: 50, y: 130 },
          labelCenter: { x: 170, y: 130 }
        }
      ]
    }, 'Forecast');

    expect(plan).toEqual({
      clearSelection: { x: 12, y: 24 },
      target: { x: 50, y: 130 },
      ok: { x: 320, y: 440 }
    });
  });

  it('matches rows by embedded display text, not only exact row text equality', () => {
    const plan = __testOnly.buildMemberSelectorPlan({
      title: 'Set Filters for Version',
      clearSelection: null,
      okButton: { x: 320, y: 440 },
      selectedMembersText: 'Selected Members',
      availableRows: [
        {
          text: 'ID: public.Forecast Display Name: Forecast',
          checkboxButton: { x: 60, y: 120 },
          labelCenter: { x: 175, y: 120 }
        }
      ]
    }, 'Forecast');

    expect(plan?.target).toEqual({ x: 60, y: 120 });
  });

  it('returns null when the row exists but the nested checkbox button is missing', () => {
    const plan = __testOnly.buildMemberSelectorPlan({
      title: 'Set Filters for Version',
      clearSelection: null,
      okButton: { x: 320, y: 440 },
      selectedMembersText: 'Selected Members',
      availableRows: [
        {
          text: 'ID: public.Forecast Display Name: Forecast',
          checkboxButton: null,
          labelCenter: { x: 175, y: 120 }
        }
      ]
    }, 'Forecast');

    expect(plan).toBeNull();
  });

  it('only treats a dimension as configured when it appears inside the requested builder axis section', () => {
    const bodyText = [
      'Toolbar',
      'Functional Area',
      'Rows',
      'Reporting Account',
      'Columns',
      'Date',
      'Filters',
      'Version (1)',
      'Forecast'
    ].join('\n');

    expect(__testOnly.hasBuilderDimension(bodyText, 'Rows', 'Functional Area')).toBe(false);
    expect(__testOnly.hasBuilderDimension(bodyText, 'Rows', 'Reporting Account')).toBe(true);
  });

  it('only treats a filter as applied when dimension and value appear inside the Filters section', () => {
    const bodyText = [
      'Forecast',
      'Rows',
      'Version Analysis',
      'Columns',
      'Forecast Version',
      'Filters',
      'Measures (1)',
      'Net Revenue'
    ].join('\n');

    expect(__testOnly.hasAppliedFilter(bodyText, { dimension: 'Version', value: 'Forecast' })).toBe(false);
    expect(
      __testOnly.hasAppliedFilter(
        `${bodyText}\nVersion (1)\nForecast`,
        { dimension: 'Version', value: 'Forecast' }
      )
    ).toBe(true);
  });

  it('closes the browser session when the attached page is not interactive enough for story authoring', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-story-configure-'));
    await writePilotBundle(root);

    const close = vi.fn().mockResolvedValue(undefined);
    const sessionFactory = vi.fn().mockResolvedValue({
      context: {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn(),
        pages: () => []
      },
      page: {
        goto: vi.fn(),
        screenshot: vi.fn(),
        url: () => 'about:blank'
      },
      close,
      takeScreenshot: vi.fn()
    });

    await expect(
      configureStoryTableFromPilot(
        { projectRoot: root },
        {
          store: {
            resolveProfile: vi.fn().mockResolvedValue({
              name: PILOT_PROFILE_NAME,
              tenantUrl: PILOT_RUNTIME_TENANT_URL,
              defaultAccount: 'sandbox@example.invalid',
              browserChannel: 'chrome',
              userDataDir: path.join(root, 'profile', 'browser'),
              defaultEvidenceDir: path.join(root, 'profile', 'evidence'),
              browserAttachMode: 'launch'
            })
          } as any,
          sessionFactory
        }
      )
    ).rejects.toMatchObject({
      code: 'STORY_BROWSER_UNAVAILABLE',
      message: 'The active browser session does not expose the interactive Playwright page APIs required for story table authoring.'
    });

    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('preserves the original story failure when diagnostics HTML capture loses the execution context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-story-configure-'));
    await writePilotBundle(root);

    const evidenceDir = path.join(root, 'attached-failure-evidence');
    const close = vi.fn().mockResolvedValue(undefined);
    let currentUrl = 'about:blank';
    const screenshot = vi.fn().mockImplementation(async (options: { path: string }) => {
      await writeFile(options.path, 'fake-image', 'utf8');
    });
    const page = {
      goto: vi.fn().mockImplementation(async (targetUrl: string) => {
        currentUrl = targetUrl;
      }),
      url: () => currentUrl,
      screenshot,
      locator: vi.fn((selector: string) => {
        if (selector === 'body') {
          return {
            innerText: vi.fn().mockResolvedValue('Attached page body preview for diagnostics')
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0),
          first: vi.fn().mockReturnThis(),
          innerText: vi.fn().mockResolvedValue(''),
          click: vi.fn(),
          fill: vi.fn(),
          dblclick: vi.fn(),
          nth: vi.fn().mockReturnThis()
        };
      }),
      getByText: vi.fn(),
      waitForTimeout: vi.fn().mockRejectedValue(new Error('story logic exploded after attach')),
      title: vi.fn().mockResolvedValue('Story title'),
      evaluate: vi.fn().mockImplementation(async (_pageFunction: unknown, arg?: { hash?: string }) => {
        if (arg?.hash) {
          currentUrl = `https://runtime.example.invalid/sap/fpa/ui/app.html${arg.hash}`;
          return null;
        }
        throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
      })
    };
    const sessionFactory = vi.fn().mockResolvedValue({
      context: {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn(),
        pages: () => []
      },
      page,
      close,
      takeScreenshot: vi.fn()
    });

    await expect(
      configureStoryTableFromPilot(
        {
          projectRoot: root,
          evidenceDir,
          attachMode: 'attach-only',
          browserDebugUrl: 'http://127.0.0.1:9333'
        },
        {
          store: {
            resolveProfile: vi.fn().mockResolvedValue({
              name: PILOT_PROFILE_NAME,
              tenantUrl: PILOT_RUNTIME_TENANT_URL,
              defaultAccount: 'sandbox@example.invalid',
              browserChannel: 'chrome',
              userDataDir: path.join(root, 'profile', 'browser'),
              defaultEvidenceDir: path.join(root, 'profile', 'evidence'),
              browserAttachMode: 'launch'
            })
          } as any,
          sessionFactory
        }
      )
    ).rejects.toThrow('story logic exploded after attach');

    expect(sessionFactory).toHaveBeenCalledWith(
      expect.objectContaining({ name: PILOT_PROFILE_NAME }),
      {
        attachMode: 'attach-only',
        browserDebugUrl: 'http://127.0.0.1:9333'
      }
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledWith({
      path: path.join(evidenceDir, 'failure.png'),
      fullPage: true
    });
    await expect(readFile(path.join(evidenceDir, 'failure-body.txt'), 'utf8')).resolves.toContain(
      'Attached page body preview for diagnostics'
    );
    await expect(readFile(path.join(evidenceDir, 'failure-url.txt'), 'utf8')).resolves.toContain(
      '#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit'
    );
    await expect(readFile(path.join(evidenceDir, 'failure-dialog.html'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    });
  });

  it('captures visible whole-table menu actions from the active story page', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-story-inspect-menu-'));
    await writePilotBundle(root);

    const evidenceDir = path.join(root, 'inspect-menu-evidence');
    const close = vi.fn().mockResolvedValue(undefined);
    let currentUrl = 'about:blank';
    const visibleMenuLabels = new Set(['Applied to Table', 'Edit Scripts...', 'Copy', 'Export']);
    const createEmptyLocator = () => ({
      count: vi.fn().mockResolvedValue(0),
      first() { return this; },
      nth() { return this; },
      isVisible: vi.fn().mockResolvedValue(false),
      click: vi.fn().mockResolvedValue(undefined)
    });
    const createVisibleLocator = () => ({
      count: vi.fn().mockResolvedValue(1),
      first() { return this; },
      nth() { return this; },
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined)
    });

    const page = {
      goto: vi.fn().mockImplementation(async (targetUrl: string) => {
        currentUrl = targetUrl;
      }),
      url: () => currentUrl,
      screenshot: vi.fn().mockImplementation(async (options: { path: string }) => {
        await writeFile(options.path, 'fake-image', 'utf8');
      }),
      locator: vi.fn((selector: string) => {
        if (selector.includes('sapLumiraStoryLayoutCommonWidgetWrapper')) {
          return {
            count: vi.fn().mockResolvedValue(1),
            nth: vi.fn().mockReturnValue({
              boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 10, width: 400, height: 300 }),
              textContent: vi.fn().mockResolvedValue('C_REPORTING Reporting Account Forecast'),
              click: vi.fn().mockResolvedValue(undefined)
            }),
            first() { return this; }
          };
        }
        if (selector === '[title="More Actions"]:visible') {
          return createVisibleLocator();
        }
        return createEmptyLocator();
      }),
      getByRole: vi.fn((role: string, options?: { name?: string }) => {
        if (role === 'button' && options?.name === 'More Actions') {
          return createVisibleLocator();
        }
        if (role === 'menuitem' && options?.name && visibleMenuLabels.has(options.name)) {
          return createVisibleLocator();
        }
        return createEmptyLocator();
      }),
      getByText: vi.fn().mockReturnValue(createEmptyLocator()),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Story')
    };

    const sessionFactory = vi.fn().mockResolvedValue({
      context: {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn(),
        pages: () => []
      },
      page,
      close,
      takeScreenshot: vi.fn()
    });

    const result = await inspectStoryTableMenuFromPilot(
      {
        projectRoot: root,
        evidenceDir
      },
      {
        store: {
          resolveProfile: vi.fn().mockResolvedValue({
            name: PILOT_PROFILE_NAME,
            tenantUrl: PILOT_RUNTIME_TENANT_URL,
            defaultAccount: 'sandbox@example.invalid',
            browserChannel: 'chrome',
            userDataDir: path.join(root, 'profile', 'browser'),
            defaultEvidenceDir: path.join(root, 'profile', 'evidence'),
            browserAttachMode: 'launch'
          })
        } as any,
        sessionFactory
      }
    );

    expect(result.status).toBe('menu-inspected');
    expect(result.visibleMenuItems).toEqual(['Applied to Table', 'Edit Scripts...', 'Copy', 'Export']);
    expect(result.artifacts.menu).toBe(path.join(evidenceDir, 'table-menu.png'));
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('captures visible table cell context-menu actions from the active story page', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-story-inspect-cell-menu-'));
    await writePilotBundle(root);

    const evidenceDir = path.join(root, 'inspect-cell-menu-evidence');
    const close = vi.fn().mockResolvedValue(undefined);
    const mouseClick = vi.fn().mockResolvedValue(undefined);
    const visibleMenuLabels = new Set(['Jump To', 'Create Visibility Filter', 'Sort']);
    const currentUrl = 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit';
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: () => currentUrl,
      screenshot: vi.fn().mockImplementation(async (options: { path: string }) => {
        await writeFile(options.path, 'fake-image', 'utf8');
      }),
      locator: vi.fn((selector: string) => {
        if (selector.includes('sapLumiraStoryLayoutCommonWidgetWrapper')) {
          return {
            count: vi.fn().mockResolvedValue(1),
            nth: vi.fn().mockReturnValue({
              boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 10, width: 400, height: 300 }),
              textContent: vi.fn().mockResolvedValue('C_REPORTING Reporting Account Forecast'),
              click: vi.fn().mockResolvedValue(undefined)
            }),
            first() { return this; }
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0),
          first() { return this; },
          nth() { return this; },
          isVisible: vi.fn().mockResolvedValue(false)
        };
      }),
      getByRole: vi.fn((role: string, options?: { name?: string }) => {
        if (role === 'menuitem' && options?.name && visibleMenuLabels.has(options.name)) {
          return {
            count: vi.fn().mockResolvedValue(1),
            first() { return this; },
            nth() { return this; },
            isVisible: vi.fn().mockResolvedValue(true)
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0),
          first() { return this; },
          nth() { return this; },
          isVisible: vi.fn().mockResolvedValue(false)
        };
      }),
      getByText: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        first() { return this; },
        nth() { return this; },
        isVisible: vi.fn().mockResolvedValue(false)
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Story'),
      evaluate: vi.fn().mockResolvedValue({
        point: { x: 180, y: 220 },
        label: 'Net Revenue'
      }),
      mouse: {
        click: mouseClick
      }
    };

    const sessionFactory = vi.fn().mockResolvedValue({
      context: {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn(),
        pages: () => []
      },
      page,
      close,
      takeScreenshot: vi.fn()
    });

    const result = await inspectStoryTableCellMenuFromPilot(
      {
        projectRoot: root,
        evidenceDir
      },
      {
        store: {
          resolveProfile: vi.fn().mockResolvedValue({
            name: PILOT_PROFILE_NAME,
            tenantUrl: PILOT_RUNTIME_TENANT_URL,
            defaultAccount: 'sandbox@example.invalid',
            browserChannel: 'chrome',
            userDataDir: path.join(root, 'profile', 'browser'),
            defaultEvidenceDir: path.join(root, 'profile', 'evidence'),
            browserAttachMode: 'launch'
          })
        } as any,
        sessionFactory
      }
    );

    expect(result.status).toBe('cell-menu-inspected');
    expect(result.targetLabel).toBe('Net Revenue');
    expect(result.visibleMenuItems).toEqual(['Jump To', 'Create Visibility Filter', 'Sort']);
    expect(mouseClick).toHaveBeenCalledWith(180, 220, { button: 'right' });
    expect(result.artifacts.menu).toBe(path.join(evidenceDir, 'table-cell-menu.png'));
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('captures visible property gates and table-type hints from the active story page', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-story-inspect-gates-'));
    await writePilotBundle(root);

    const evidenceDir = path.join(root, 'inspect-gates-evidence');
    const close = vi.fn().mockResolvedValue(undefined);
    const currentUrl = 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit';
    const bodyText = [
      'Advanced Mode',
      'Switch All Tables to New Build Experience',
      'Cross-tab',
      'Adaptive Column Width',
      'Arrange Totals / Parent Nodes Below',
      'Enable Data Analyzer'
    ].join('\n');

    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      url: () => currentUrl,
      screenshot: vi.fn().mockImplementation(async (options: { path: string }) => {
        await writeFile(options.path, 'fake-image', 'utf8');
      }),
      locator: vi.fn((selector: string) => {
        if (selector.includes('sapLumiraStoryLayoutCommonWidgetWrapper')) {
          return {
            count: vi.fn().mockResolvedValue(0),
            nth: vi.fn().mockReturnValue({
              boundingBox: vi.fn().mockResolvedValue(null),
              textContent: vi.fn().mockResolvedValue(''),
              click: vi.fn().mockResolvedValue(undefined)
            }),
            first() { return this; }
          };
        }
        if (selector === 'body') {
          return {
            innerText: vi.fn().mockResolvedValue(bodyText)
          };
        }
        return {
          count: vi.fn().mockResolvedValue(0),
          first() { return this; },
          nth() { return this; }
        };
      }),
      getByRole: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        first() { return this; },
        nth() { return this; }
      }),
      getByText: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
        first() { return this; },
        nth() { return this; }
      }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      title: vi.fn().mockResolvedValue('Story')
    };

    const sessionFactory = vi.fn().mockResolvedValue({
      context: {
        close: vi.fn().mockResolvedValue(undefined),
        newPage: vi.fn(),
        pages: () => []
      },
      page,
      close,
      takeScreenshot: vi.fn()
    });

    const result = await inspectStoryTablePropertyGatesFromPilot(
      {
        projectRoot: root,
        evidenceDir
      },
      {
        store: {
          resolveProfile: vi.fn().mockResolvedValue({
            name: PILOT_PROFILE_NAME,
            tenantUrl: PILOT_RUNTIME_TENANT_URL,
            defaultAccount: 'sandbox@example.invalid',
            browserChannel: 'chrome',
            userDataDir: path.join(root, 'profile', 'browser'),
            defaultEvidenceDir: path.join(root, 'profile', 'evidence'),
            browserAttachMode: 'launch'
          })
        } as any,
        sessionFactory
      }
    );

    expect(result.status).toBe('property-gates-inspected');
    expect(result.visiblePropertyLabels).toEqual([
      'Advanced Mode',
      'Switch All Tables to New Build Experience',
      'Cross-tab',
      'Adaptive Column Width',
      'Arrange Totals / Parent Nodes Below',
      'Enable Data Analyzer'
    ]);
    expect(result.propertyGates).toEqual({
      advancedModeVisible: true,
      switchAllTablesToNewBuildExperienceVisible: true,
      crossTabVisible: true,
      forecastLayoutVisible: false,
      nonAggregatedListVisible: false,
      adaptiveColumnWidthVisible: true,
      arrangeTotalsParentNodesBelowVisible: true,
      enableQuickBuilderVisible: false,
      enableDataAnalyzerVisible: true,
      enableExcelAddInVisible: false,
      disableInteractionVisible: false,
      dataRefreshVisible: false
    });
    expect(result.artifacts.gates).toBe(path.join(evidenceDir, 'table-property-gates.png'));
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
