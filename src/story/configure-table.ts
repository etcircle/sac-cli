import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { type ConfigPaths, createConfigPaths } from '../config/paths.js';
import { type ProfileStore, createProfileStore } from '../config/profile-store.js';
import { type BrowserAttachMode, type SacCliProfile } from '../config/schema.js';
import { inspectPilotBundle, type PilotBundleInspection } from '../pilot/bundle.js';
import {
  type BrowserRuntime,
  type ManagedBrowserSession,
  createDefaultBrowserRuntime,
  ensureSacAppShell,
  ensureSacAppUrl,
  openManagedBrowserSession,
  openSacRoute
} from '../session/browser-session.js';

export type StoryTableFilter = {
  dimension: string;
  value: string;
};

export type ConfigureStoryTableInput = {
  projectRoot?: string;
  storyUrl?: string;
  profileName?: string;
  evidenceDir?: string;
  widgetKey?: string;
  browserDebugUrl?: string;
  attachMode?: BrowserAttachMode;
  rows?: string[];
  columns?: string[];
  filters?: StoryTableFilter[];
};

export type StoryTableDimensionInput = {
  dimension: string;
} & ConfigureStoryTableInput;

export type StoryTableFilterInput = StoryTableFilter & ConfigureStoryTableInput;

export type ConfigureStoryTableDependencies = {
  paths?: ConfigPaths;
  store?: ProfileStore;
  runtime?: BrowserRuntime;
  sessionFactory?: (
    profile: SacCliProfile,
    options?: Pick<ConfigureStoryTableInput, 'attachMode' | 'browserDebugUrl'>
  ) => Promise<ManagedBrowserSession>;
};

const TABLE_MENU_LABELS = [
  'Applied to Table',
  'Drill',
  'Freeze',
  'Ignore Data Locks',
  'Enforce Data Locks',
  'Swap Axis',
  'Resize table to fit content',
  'Resize Table to Fit Content',
  'Mass Data Entry',
  'Distribute Values',
  'Manage Data Locks...',
  'Value Lock Management',
  'Remove Reference',
  'Linked Analysis',
  'Add',
  'Show/Hide',
  'Edit Scripts...',
  'Copy',
  'Export',
  'Edit Styling...',
  'Edit Styling',
  'Open Quick Builder',
  'Open Data Analyzer...',
  'Open in Excel Add-in...',
  'Full Screen',
  'Fullscreen',
  'Lock in Place',
  'Unlock in Place',
  'Delete'
] as const;

const TABLE_CELL_MENU_LABELS = [
  'Jump To',
  'Filter',
  'Filter by Member',
  'Create Visibility Filter',
  'Sort',
  'Sort Ascending',
  'Sort Descending',
  'Drill',
  'Show/Hide',
  'Create Threshold...',
  'Create Threshold',
  'Comment',
  'Manage Data Locks...',
  'Value Lock Management',
  'Open Data Analyzer...',
  'Open in Excel Add-in...',
  'Copy',
  'Export'
] as const;

const TABLE_PROPERTY_LABELS = [
  'Advanced Mode',
  'Switch All Tables to New Build Experience',
  'Cross-tab',
  'Forecast Layout',
  'Non-Aggregated List',
  'Adaptive Column Width',
  'Arrange Totals / Parent Nodes Below',
  'Enable Quick Builder',
  'Enable Data Analyzer',
  'Enable Excel Add-in',
  'Disable Interaction',
  'Data Refresh'
] as const;

function createStoryBrowserUnavailableError(): CliError {
  return new CliError(
    'STORY_BROWSER_UNAVAILABLE',
    'The active browser session does not expose the interactive Playwright page APIs required for story table authoring.',
    ExitCode.GeneralError
  );
}

function createStoryWidgetMissingError(widgetKey: string): CliError {
  return new CliError(
    'STORY_WIDGET_MISSING',
    `Pilot widget "${widgetKey}" could not be resolved from the checked-in pilot bundle.`,
    ExitCode.InvalidInput
  );
}

function createStoryRouteRequiredError(): CliError {
  return new CliError(
    'STORY_ROUTE_REQUIRED',
    'A story edit route is required. Pass --story-url or provide a pilot bundle story route.',
    ExitCode.InvalidInput
  );
}

function asInteractivePage(page: unknown): Page {
  const candidate = page as Page;
  if (
    !candidate
    || typeof candidate.locator !== 'function'
    || typeof candidate.getByText !== 'function'
    || typeof candidate.waitForTimeout !== 'function'
    || typeof candidate.title !== 'function'
  ) {
    throw createStoryBrowserUnavailableError();
  }
  return candidate;
}

async function createSessionFactory(
  runtime?: BrowserRuntime
): Promise<(
  profile: SacCliProfile,
  options?: Pick<ConfigureStoryTableInput, 'attachMode' | 'browserDebugUrl'>
) => Promise<ManagedBrowserSession>> {
  const resolvedRuntime = runtime ?? await createDefaultBrowserRuntime();
  return async (
    profile: SacCliProfile,
    options: Pick<ConfigureStoryTableInput, 'attachMode' | 'browserDebugUrl'> = {}
  ) => openManagedBrowserSession(profile, resolvedRuntime, options);
}

function resolveStoryTarget(input: ConfigureStoryTableInput, inspection: PilotBundleInspection) {
  const baseWidget = input.widgetKey
    ? inspection.widgets.find((entry) => entry.key === input.widgetKey)
    : inspection.widgets.find((entry) => entry.type === 'planning-table');

  if (!baseWidget) {
    throw createStoryWidgetMissingError(input.widgetKey ?? 'planning-table');
  }

  const storyUrl = input.storyUrl ?? inspection.proofInputs.story.route;
  if (!storyUrl) {
    throw createStoryRouteRequiredError();
  }

  return {
    widget: {
      ...baseWidget,
      rows: input.rows ?? [...baseWidget.rows],
      columns: input.columns ?? [...baseWidget.columns],
      filters: input.filters ?? baseWidget.filters.map((entry) => ({ dimension: entry.dimension, value: entry.value }))
    },
    storyUrl
  };
}

async function ensureTableBuilderReady(page: Page): Promise<void> {
  await page.waitForTimeout(8000);
}

async function maybeInsertTable(page: Page): Promise<boolean> {
  const addTable = page.locator('#ADD_TABLEId-1');
  if (await addTable.count()) {
    await addTable.click({ timeout: 30000 });
    await page.waitForTimeout(3000);
    return true;
  }
  return false;
}

async function locateVisibleSearchField(page: Page) {
  return page.locator('input.sapMSFI:visible, input.sapMSFInput:visible, input[type="search"]:visible').first();
}

async function saveStoryCheckpoint(page: Page, reason: string): Promise<void> {
  const candidate = page as Page & { keyboard?: { press(key: string): Promise<void> } };

  if (candidate.keyboard && typeof candidate.keyboard.press === 'function') {
    const saveShortcut = process.platform === 'darwin' ? 'Meta+S' : 'Control+S';
    await candidate.keyboard.press(saveShortcut);
    await page.waitForTimeout(2500);
    return;
  }

  const saveButton = page.getByRole('button', { name: 'Save', exact: true }).first();
  if (await saveButton.count() > 0) {
    await saveButton.click();
    await page.waitForTimeout(2500);
    return;
  }

  const saveByTitle = page.locator('[title="Save"]:visible').first();
  if (await saveByTitle.count() > 0) {
    await saveByTitle.click();
    await page.waitForTimeout(2500);
    return;
  }

  throw new CliError(
    'STORY_SAVE_UNAVAILABLE',
    `Could not save the story after ${reason}; no visible save control or keyboard save path was available.`,
    ExitCode.GeneralError
  );
}

async function selectTableWidget(page: Page): Promise<boolean> {
  const wrappers = page.locator('div.sapLumiraStoryLayoutCommonWidgetWrapper, div[class*="WidgetWrapper"]');
  const count = await wrappers.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = wrappers.nth(index);
    const box = await candidate.boundingBox();
    if (!box) {
      continue;
    }
    const text = ((await candidate.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (
      !text.includes('C_REPORTING')
      && !text.includes('Reporting Account')
      && !text.includes('Audittrail')
      && !text.includes('Version')
      && !text.includes('Forecast')
    ) {
      continue;
    }
    await candidate.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

async function readVisibleMenuLabels(page: Page, labels: readonly string[]): Promise<string[]> {
  const visible: string[] = [];

  for (const label of labels) {
    const locators = [
      page.getByRole('menuitem', { name: label, exact: true }),
      page.getByRole('button', { name: label, exact: true }),
      page.getByText(label, { exact: true }),
      page.locator(`[title="${label}"]`)
    ];

    let found = false;
    for (const locator of locators) {
      const count = await locator.count();
      for (let index = 0; index < count; index += 1) {
        if (await locator.nth(index).isVisible().catch(() => false)) {
          visible.push(label);
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
  }

  return visible;
}

async function openTableMoreActionsMenu(page: Page): Promise<string[]> {
  await selectTableWidget(page);

  const moreActionsButton = page.getByRole('button', { name: 'More Actions', exact: true }).first();
  if (await moreActionsButton.count() > 0) {
    await moreActionsButton.click();
    await page.waitForTimeout(1500);
    return readVisibleMenuLabels(page, TABLE_MENU_LABELS);
  }

  const moreActionsByTitle = page.locator('[title="More Actions"]:visible').first();
  if (await moreActionsByTitle.count() > 0) {
    await moreActionsByTitle.click();
    await page.waitForTimeout(1500);
    return readVisibleMenuLabels(page, TABLE_MENU_LABELS);
  }

  throw new CliError(
    'STORY_TABLE_MENU_UNAVAILABLE',
    'Could not open the table More Actions menu; no visible More Actions control was found on the active story page.',
    ExitCode.GeneralError
  );
}

type TableContextTarget = {
  point: Point;
  label: string;
};

async function locateTableContextTarget(page: Page): Promise<TableContextTarget | null> {
  return page.evaluate(function () {
    function normalize(value: string | null | undefined): string {
      return (value || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0 && rect.width > 6 && rect.height > 6;
    }

    function centerOf(element: HTMLElement): Point {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
    }

    const wrappers = Array.from(document.querySelectorAll<HTMLElement>('div.sapLumiraStoryLayoutCommonWidgetWrapper, div[class*="WidgetWrapper"]'));
    const wrapper = wrappers.find((candidate) => {
      const text = normalize(candidate.textContent);
      return text.includes('C_REPORTING')
        || text.includes('Reporting Account')
        || text.includes('Audittrail')
        || text.includes('Version')
        || text.includes('Forecast');
    }) ?? null;

    const candidateSelectors = [
      '[role="gridcell"]',
      '[role="cell"]',
      '[role="rowheader"]',
      '[role="columnheader"]',
      '[aria-colindex]',
      '[aria-rowindex]',
      'td',
      'th'
    ].join(', ');

    const excluded = new Set([
      'Builder',
      'Styling',
      'Rows',
      'Columns',
      'Filters',
      'Add Dimensions',
      'Add Filters',
      'More Actions',
      'Right Side Panel',
      'Data Source',
      'Table Type'
    ]);

    const roots = [wrapper, document.body].filter(Boolean) as HTMLElement[];
    for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
      const root = roots[rootIndex];
      const candidates = Array.from(root.querySelectorAll<HTMLElement>(candidateSelectors));
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const text = normalize(candidate.textContent);
        if (!text || excluded.has(text) || !isVisible(candidate)) {
          continue;
        }
        return {
          point: centerOf(candidate),
          label: text
        } satisfies TableContextTarget;
      }
    }

    return null;
  });
}

async function openTableCellContextMenu(page: Page): Promise<{ targetLabel: string; visibleMenuItems: string[] }> {
  await selectTableWidget(page);
  const target = await locateTableContextTarget(page);
  if (!target) {
    throw new CliError(
      'STORY_TABLE_CELL_TARGET_UNAVAILABLE',
      'Could not find a visible table cell or header target for context-menu inspection on the active story page.',
      ExitCode.GeneralError
    );
  }

  await page.mouse.click(target.point.x, target.point.y, { button: 'right' });
  await page.waitForTimeout(1500);
  const visibleMenuItems = await readVisibleMenuLabels(page, TABLE_CELL_MENU_LABELS);
  if (visibleMenuItems.length === 0) {
    throw new CliError(
      'STORY_TABLE_CELL_MENU_UNAVAILABLE',
      `A context-menu target was found (${target.label}), but no visible table cell context-menu entries were detected after opening it.`,
      ExitCode.GeneralError
    );
  }

  return {
    targetLabel: target.label,
    visibleMenuItems
  };
}

async function maybeBindModel(page: Page, modelName: string): Promise<boolean> {
  const prompt = page.getByText('Select other model...', { exact: true });
  if (await prompt.count() === 0) {
    return false;
  }

  await prompt.click();
  await page.waitForTimeout(2500);
  const search = await locateVisibleSearchField(page);
  await search.click();
  await search.fill(modelName);
  await page.waitForTimeout(2500);
  await page.getByText(modelName, { exact: false }).first().dblclick();
  await page.waitForTimeout(4000);
  return true;
}

async function maybeFillVariables(page: Page): Promise<boolean> {
  const filledViaDom = await page.evaluate(function (input: { values: string[] }) {
    const all = document.querySelectorAll('*');
    let dialogRoot: HTMLElement | null = null;

    for (let index = 0; index < all.length; index += 1) {
      const element = all[index] as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (
        text.includes('Set Variables for')
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0
      ) {
        let candidate: HTMLElement | null = element;
        while (candidate) {
          if (candidate.querySelectorAll('input').length >= input.values.length) {
            dialogRoot = candidate;
            break;
          }
          candidate = candidate.parentElement;
        }
        if (dialogRoot) {
          break;
        }
      }
    }

    if (!dialogRoot) {
      return false;
    }

    const inputs = dialogRoot.querySelectorAll('input');
    let filledCount = 0;
    for (let index = 0; index < inputs.length && filledCount < input.values.length; index += 1) {
      const field = inputs[index] as HTMLInputElement;
      const rect = field.getBoundingClientRect();
      const style = window.getComputedStyle(field);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || Number(style.opacity || '1') <= 0
        || rect.width <= 0
        || rect.height <= 0
      ) {
        continue;
      }
      field.focus();
      field.value = input.values[filledCount];
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      filledCount += 1;
    }

    if (filledCount < input.values.length) {
      return false;
    }

    return true;
  }, { values: ['202004', '202003', '2020', '2019'] });

  if (filledViaDom) {
    await page.waitForTimeout(1000);
    const setButton = page.getByRole('button', { name: 'Set', exact: true }).first();
    if (await setButton.count() > 0) {
      await setButton.click();
    } else {
      await clickVisibleExactText(page, 'Set');
    }
    await page.waitForTimeout(15000);
    return true;
  }

  const visibleVariableInputs = page.locator('input[placeholder="Enter the ID for a member"]:visible');
  if (await visibleVariableInputs.count() >= 4) {
    const values = ['202004', '202003', '2020', '2019'];
    for (const [index, value] of values.entries()) {
      await visibleVariableInputs.nth(index).fill(value);
    }
    await page.waitForTimeout(1000);
    const setButton = page.getByRole('button', { name: 'Set', exact: true }).first();
    if (await setButton.count() > 0) {
      await setButton.click();
    } else {
      await clickVisibleExactText(page, 'Set');
    }
    await page.waitForTimeout(15000);
    return true;
  }

  const currentPeriod = page.locator('#_input_1-inner');
  if (await currentPeriod.count() === 0) {
    return false;
  }

  await currentPeriod.fill('202004');
  await page.locator('#_input_2-inner').fill('202003');
  await page.locator('#_input_3-inner').fill('2020');
  await page.locator('#_input_4-inner').fill('2019');
  await page.waitForTimeout(1000);
  const setButton = page.getByRole('button', { name: 'Set', exact: true }).first();
  if (await setButton.count() > 0) {
    await setButton.click();
  } else {
    await page.locator('#_dialogbutton_3').click();
  }
  await page.waitForTimeout(15000);
  return true;
}

async function captureEvidence(page: Page, evidenceDir: string, name: string): Promise<string> {
  await mkdir(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return screenshotPath;
}

async function readBodyText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

function inspectVisiblePropertyGates(bodyText: string): {
  visiblePropertyLabels: string[];
  propertyGates: {
    advancedModeVisible: boolean;
    switchAllTablesToNewBuildExperienceVisible: boolean;
    crossTabVisible: boolean;
    forecastLayoutVisible: boolean;
    nonAggregatedListVisible: boolean;
    adaptiveColumnWidthVisible: boolean;
    arrangeTotalsParentNodesBelowVisible: boolean;
    enableQuickBuilderVisible: boolean;
    enableDataAnalyzerVisible: boolean;
    enableExcelAddInVisible: boolean;
    disableInteractionVisible: boolean;
    dataRefreshVisible: boolean;
  };
} {
  const visiblePropertyLabels = TABLE_PROPERTY_LABELS.filter((label) => bodyText.includes(label));

  return {
    visiblePropertyLabels,
    propertyGates: {
      advancedModeVisible: visiblePropertyLabels.includes('Advanced Mode'),
      switchAllTablesToNewBuildExperienceVisible: visiblePropertyLabels.includes('Switch All Tables to New Build Experience'),
      crossTabVisible: visiblePropertyLabels.includes('Cross-tab'),
      forecastLayoutVisible: visiblePropertyLabels.includes('Forecast Layout'),
      nonAggregatedListVisible: visiblePropertyLabels.includes('Non-Aggregated List'),
      adaptiveColumnWidthVisible: visiblePropertyLabels.includes('Adaptive Column Width'),
      arrangeTotalsParentNodesBelowVisible: visiblePropertyLabels.includes('Arrange Totals / Parent Nodes Below'),
      enableQuickBuilderVisible: visiblePropertyLabels.includes('Enable Quick Builder'),
      enableDataAnalyzerVisible: visiblePropertyLabels.includes('Enable Data Analyzer'),
      enableExcelAddInVisible: visiblePropertyLabels.includes('Enable Excel Add-in'),
      disableInteractionVisible: visiblePropertyLabels.includes('Disable Interaction'),
      dataRefreshVisible: visiblePropertyLabels.includes('Data Refresh')
    }
  };
}

async function captureFailureDiagnostics(page: Page, evidenceDir: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });

  const diagnostics = await Promise.allSettled([
    page.screenshot({ path: path.join(evidenceDir, 'failure.png'), fullPage: true }),
    readBodyText(page).then((bodyText) => writeFile(path.join(evidenceDir, 'failure-body.txt'), bodyText, 'utf8')),
    writeFile(path.join(evidenceDir, 'failure-url.txt'), page.url(), 'utf8'),
    page
      .evaluate(function () {
        const all = document.querySelectorAll('*');
        for (let index = 0; index < all.length; index += 1) {
          const element = all[index] as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
          if (
            (text.includes('Set Filters for') || text.includes('Set Variables for'))
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || '1') > 0
            && rect.width > 0
            && rect.height > 0
          ) {
            let candidate: HTMLElement | null = element;
            while (candidate) {
              if ((candidate.textContent || '').includes('Cancel')) {
                return candidate.outerHTML;
              }
              candidate = candidate.parentElement;
            }
          }
        }
        return null;
      })
      .then((visibleDialogHtml) => (
        visibleDialogHtml
          ? writeFile(path.join(evidenceDir, 'failure-dialog.html'), visibleDialogHtml, 'utf8')
          : Promise.resolve()
      ))
  ]);

  void diagnostics;
}

async function clickIfPresent(page: Page, text: string): Promise<boolean> {
  const locator = page.getByText(text, { exact: true }).first();
  if (await locator.count() === 0) {
    return false;
  }
  await locator.click();
  return true;
}

async function clickVisibleExactText(page: Page, text: string): Promise<boolean> {
  return page.evaluate(function (input: { text: string }) {
    const all = document.querySelectorAll('*');
    for (let index = 0; index < all.length; index += 1) {
      const element = all[index] as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const normalized = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (
        normalized === input.text
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0
      ) {
        element.click();
        return true;
      }
    }

    return false;
  }, { text });
}

async function maybeConfirmDialog(page: Page): Promise<void> {
  const okByRole = page.getByRole('button', { name: 'OK' }).first();
  if (await okByRole.count() > 0) {
    await okByRole.click();
    return;
  }

  const okByText = page.getByText('OK', { exact: true }).first();
  if (await okByText.count() > 0) {
    await okByText.click();
  }
}

async function addDimension(
  page: Page,
  addButton: ReturnType<Page['locator']>,
  axis: 'Rows' | 'Columns',
  dimension: string
): Promise<void> {
  const bodyBefore = await readBodyText(page);
  if (hasBuilderDimension(bodyBefore, axis, dimension)) {
    return;
  }

  await addButton.click();
  await page.waitForTimeout(2500);

  const searchField = await locateVisibleSearchField(page);
  if (await searchField.count() > 0) {
    await searchField.click();
    await searchField.fill(dimension);
    await page.waitForTimeout(2000);
  }

  if (!await clickVisibleExactText(page, dimension)) {
    throw new CliError(
      'STORY_TABLE_DIMENSION_NOT_FOUND',
      `Could not find dimension "${dimension}" in the active table builder picker.`,
      ExitCode.GeneralError
    );
  }

  await page.waitForTimeout(1500);
  await maybeConfirmDialog(page);
  await page.waitForTimeout(4000);
}

async function ensureRowsAndColumns(page: Page, widget: PilotBundleInspection['widgets'][number]): Promise<void> {
  const addDimensionButtons = page.getByText('Add Dimensions', { exact: true });

  for (const dimension of widget.rows) {
    await addDimension(page, addDimensionButtons.nth(0), 'Rows', dimension);
  }

  for (const dimension of widget.columns) {
    await addDimension(page, addDimensionButtons.nth(1), 'Columns', dimension);
  }
}

async function openFilterPicker(page: Page, dimension: string): Promise<void> {
  if (await clickVisibleExactText(page, dimension)) {
    await page.waitForTimeout(1500);
    return;
  }

  const addFilters = page.getByText('Add Filters', { exact: true }).first();
  await addFilters.click();
  await page.waitForTimeout(2500);
  if (!await clickVisibleExactText(page, dimension)) {
    throw new CliError(
      'STORY_TABLE_FILTER_NOT_FOUND',
      `Could not open the ${dimension} filter picker from the active table builder.`,
      ExitCode.GeneralError
    );
  }
  await page.waitForTimeout(1500);
}

type Point = { x: number; y: number };

type MemberSelectorSnapshotRow = {
  text: string;
  checkboxButton: Point | null;
  labelCenter: Point | null;
};

type MemberSelectorSnapshot = {
  title: string;
  clearSelection: Point | null;
  okButton: Point | null;
  selectedMembersText: string;
  availableRows: MemberSelectorSnapshotRow[];
};

type MemberSelectorPlan = {
  clearSelection: Point | null;
  target: Point;
  ok: Point;
};

function normalizeMemberSelectorText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function extractBuilderSection(bodyText: string, section: 'Rows' | 'Columns' | 'Filters'): string {
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => normalizeMemberSelectorText(line))
    .filter(Boolean);
  const sectionIndex = lines.findIndex((line) => line === section);
  if (sectionIndex === -1) {
    return '';
  }

  const stopSections = new Set(['Rows', 'Columns', 'Filters'].filter((entry) => entry !== section));
  const sectionLines: string[] = [];
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopSections.has(line)) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines.join('\n');
}

function hasBuilderDimension(bodyText: string, section: 'Rows' | 'Columns', dimension: string): boolean {
  return normalizeMemberSelectorText(extractBuilderSection(bodyText, section)).toLowerCase().includes(
    normalizeMemberSelectorText(dimension).toLowerCase()
  );
}

function hasAppliedFilter(bodyText: string, filter: StoryTableFilter): boolean {
  const filterSection = normalizeMemberSelectorText(extractBuilderSection(bodyText, 'Filters')).toLowerCase();
  return filterSection.includes(normalizeMemberSelectorText(filter.dimension).toLowerCase())
    && filterSection.includes(normalizeMemberSelectorText(filter.value).toLowerCase());
}

function buildMemberSelectorPlan(snapshot: MemberSelectorSnapshot | null, targetValue: string): MemberSelectorPlan | null {
  if (!snapshot?.okButton) {
    return null;
  }

  const normalizedTarget = normalizeMemberSelectorText(targetValue).toLowerCase();
  const matchingRow = snapshot.availableRows.find((row) => normalizeMemberSelectorText(row.text).toLowerCase().includes(normalizedTarget));
  if (!matchingRow?.checkboxButton) {
    return null;
  }

  return {
    clearSelection: snapshot.clearSelection,
    target: matchingRow.checkboxButton,
    ok: snapshot.okButton
  };
}

async function readSelectedMembersText(page: Page, filter: StoryTableFilter): Promise<string | null> {
  return page.evaluate(function (input: StoryTableFilter) {
    const all = document.querySelectorAll('*');
    for (let index = 0; index < all.length; index += 1) {
      const element = all[index] as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (
        text.includes(`Set Filters for ${input.dimension}`)
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || '1') > 0
        && rect.width > 0
        && rect.height > 0
      ) {
        let candidate: HTMLElement | null = element;
        while (candidate) {
          const candidateText = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
          if (candidateText.includes('Available Members') && candidateText.includes('Selected Members')) {
            const normalized = candidateText;
            const selectedIndex = normalized.indexOf('Selected Members');
            if (selectedIndex === -1) {
              return normalized;
            }
            const okIndex = normalized.indexOf(' OK ', selectedIndex);
            return (okIndex === -1 ? normalized.slice(selectedIndex) : normalized.slice(selectedIndex, okIndex)).trim();
          }
          candidate = candidate.parentElement;
        }
      }
    }
    return null;
  }, filter);
}

async function applyFilterSelectionInDialog(page: Page, filter: StoryTableFilter): Promise<boolean> {
  const dialogTitle = page.getByText(`Set Filters for ${filter.dimension}`, { exact: false }).first();
  if (await dialogTitle.count() > 0) {
    const clearSelection = page.getByText('Clear Selection', { exact: true }).first();
    if (await clearSelection.count() > 0) {
      await clearSelection.click();
      await page.waitForTimeout(500);
    }

    const targetCheckbox = page.getByRole('checkbox', { name: filter.value, exact: true }).first();
    if (await targetCheckbox.count() > 0) {
      await targetCheckbox.click();
      await page.waitForTimeout(500);
      const selectedMembersText = normalizeMemberSelectorText(await readSelectedMembersText(page, filter));
      const okButton = page.getByRole('button', { name: 'OK', exact: true }).first();
      if (selectedMembersText.includes(filter.value) && await okButton.count() > 0) {
        await okButton.click();
        return true;
      }
    }
  }

  const snapshot = await page.evaluate(function (input: StoryTableFilter) {
    const all = document.querySelectorAll('*');
    let dialogRoot: HTMLElement | null = null;

    function isVisible(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0 && rect.width > 0 && rect.height > 0;
    }

    function centerOf(element: HTMLElement): Point {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) };
    }

    for (let index = 0; index < all.length; index += 1) {
      const element = all[index] as HTMLElement;
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.includes(`Set Filters for ${input.dimension}`) && isVisible(element)) {
        let candidate: HTMLElement | null = element;
        while (candidate) {
          const candidateText = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
          if (candidateText.includes('Available Members') && candidateText.includes('Selected Members')) {
            dialogRoot = candidate;
            break;
          }
          candidate = candidate.parentElement;
        }
        if (dialogRoot) {
          break;
        }
      }
    }

    if (!dialogRoot) {
      return null;
    }

    const clickable = Array.from(dialogRoot.querySelectorAll<HTMLElement>('button, [role="button"], div, span, label, input'));
    const clearSelection = clickable.find((element) => isVisible(element) && (element.textContent || '').replace(/\s+/g, ' ').trim() === 'Clear Selection') ?? null;
    const okButton = clickable.find((element) => isVisible(element) && (element.textContent || '').replace(/\s+/g, ' ').trim() === 'OK') ?? null;
    const rowNodes = Array.from(dialogRoot.querySelectorAll<HTMLElement>('.sapUiTreeNode, [id*="custom-tree-"]'));
    const availableRows = rowNodes
      .filter((row) => isVisible(row))
      .map((row) => {
        const rowText = (row.textContent || '').replace(/\s+/g, ' ').trim();
        const checkboxButton = row.querySelector<HTMLElement>('.sapEpmUiCheckBox button, .sapEpmUiCheckBox [role="button"], button, [role="button"]');
        return {
          text: rowText,
          checkboxButton: checkboxButton && isVisible(checkboxButton) ? centerOf(checkboxButton) : null,
          labelCenter: centerOf(row)
        };
      })
      .filter((row, index, rows) => row.text && rows.findIndex((candidate) => candidate.text === row.text) === index);

    const normalized = (dialogRoot.textContent || '').replace(/\s+/g, ' ').trim();
    const selectedIndex = normalized.indexOf('Selected Members');
    const okIndex = normalized.indexOf(' OK ', selectedIndex);
    return {
      title: `Set Filters for ${input.dimension}`,
      clearSelection: clearSelection ? centerOf(clearSelection) : null,
      okButton: okButton ? centerOf(okButton) : null,
      selectedMembersText: selectedIndex === -1 ? '' : (okIndex === -1 ? normalized.slice(selectedIndex) : normalized.slice(selectedIndex, okIndex)).trim(),
      availableRows
    } satisfies MemberSelectorSnapshot;
  }, filter);

  const plan = buildMemberSelectorPlan(snapshot, filter.value);
  if (!plan) {
    return false;
  }

  if (plan.clearSelection) {
    await page.mouse.click(plan.clearSelection.x, plan.clearSelection.y);
    await page.waitForTimeout(500);
  }

  await page.mouse.click(plan.target.x, plan.target.y);
  await page.waitForTimeout(500);
  const selectedMembersText = normalizeMemberSelectorText(await readSelectedMembersText(page, filter));
  if (!selectedMembersText.includes(filter.value)) {
    return false;
  }

  await page.mouse.click(plan.ok.x, plan.ok.y);
  return true;
}

export const __testOnly = {
  buildMemberSelectorPlan,
  createSessionFactory,
  extractBuilderSection,
  hasBuilderDimension,
  hasAppliedFilter
};

async function ensureFilter(page: Page, filter: StoryTableFilter): Promise<void> {
  const bodyBefore = await readBodyText(page);
  if (hasAppliedFilter(bodyBefore, filter)) {
    return;
  }

  await openFilterPicker(page, filter.dimension);

  if (await applyFilterSelectionInDialog(page, filter)) {
    await page.waitForTimeout(4000);
    return;
  }

  const searchField = await locateVisibleSearchField(page);
  if (await searchField.count() > 0) {
    await searchField.click();
    await searchField.fill(filter.value);
    await page.waitForTimeout(1500);
  }

  const clearSelection = page.getByText('Clear Selection', { exact: true }).first();
  if (await clearSelection.count() > 0) {
    await clearSelection.click();
    await page.waitForTimeout(500);
  } else if (filter.value !== 'Actual') {
    await clickVisibleExactText(page, 'Actual');
    await page.waitForTimeout(500);
  }

  const targetValue = page.getByText(filter.value, { exact: true }).first();
  if (await targetValue.count() > 0) {
    await targetValue.click();
  } else if (!await clickVisibleExactText(page, filter.value)) {
    throw new CliError(
      'STORY_TABLE_FILTER_VALUE_NOT_FOUND',
      `Could not find filter value "${filter.value}" for dimension "${filter.dimension}" in the active filter picker.`,
      ExitCode.GeneralError
    );
  }

  await page.waitForTimeout(1000);
  await maybeConfirmDialog(page);
  await page.waitForTimeout(4000);
}

async function ensureFilters(page: Page, widget: PilotBundleInspection['widgets'][number]): Promise<void> {
  for (const filter of widget.filters as StoryTableFilter[]) {
    await ensureFilter(page, filter);
  }
}

function appendUniqueDimension(dimensions: string[], dimension: string): string[] {
  return dimensions.includes(dimension)
    ? [...dimensions]
    : [...dimensions, dimension];
}

function upsertFilter(filters: StoryTableFilter[], filter: StoryTableFilter): StoryTableFilter[] {
  const withoutDimension = filters.filter((entry) => entry.dimension !== filter.dimension);
  return [...withoutDimension, filter];
}

async function inspectPilotWidget(input: ConfigureStoryTableInput): Promise<PilotBundleInspection['widgets'][number]> {
  const inspection = await inspectPilotBundle(input.projectRoot ?? process.cwd());
  return resolveStoryTarget(input, inspection).widget;
}

export async function addStoryTableRowDimensionFromPilot(
  input: StoryTableDimensionInput,
  deps: ConfigureStoryTableDependencies = {}
) {
  const widget = await inspectPilotWidget(input);
  return configureStoryTableFromPilot(
    {
      ...input,
      rows: appendUniqueDimension(widget.rows, input.dimension)
    },
    deps
  );
}

export async function addStoryTableColumnDimensionFromPilot(
  input: StoryTableDimensionInput,
  deps: ConfigureStoryTableDependencies = {}
) {
  const widget = await inspectPilotWidget(input);
  return configureStoryTableFromPilot(
    {
      ...input,
      columns: appendUniqueDimension(widget.columns, input.dimension)
    },
    deps
  );
}

export async function setStoryTableFilterFromPilot(
  input: StoryTableFilterInput,
  deps: ConfigureStoryTableDependencies = {}
) {
  const widget = await inspectPilotWidget(input);
  return configureStoryTableFromPilot(
    {
      ...input,
      filters: upsertFilter(widget.filters as StoryTableFilter[], {
        dimension: input.dimension,
        value: input.value
      })
    },
    deps
  );
}

export async function inspectStoryTableMenuFromPilot(
  input: ConfigureStoryTableInput = {},
  deps: ConfigureStoryTableDependencies = {}
): Promise<{
  status: 'menu-inspected';
  profile: string;
  storyUrl: string;
  widgetKey: string;
  evidenceDir: string;
  title: string;
  route: string;
  visibleMenuItems: string[];
  artifacts: { menu: string };
}> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const inspection = await inspectPilotBundle(projectRoot);
  const { widget, storyUrl } = resolveStoryTarget(input, inspection);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const session = await sessionFactory(profile, {
    attachMode: input.attachMode,
    browserDebugUrl: input.browserDebugUrl
  });
  const evidenceDir = path.resolve(input.evidenceDir ?? path.join(profile.defaultEvidenceDir, 'story-inspect-menu'));

  try {
    const page = asInteractivePage(session.page);
    try {
      const targetUrl = new URL(storyUrl, ensureSacAppUrl(profile.tenantUrl)).toString();
      await ensureSacAppShell(session.page, profile.tenantUrl);
      await openSacRoute(session.page, targetUrl);
      await ensureTableBuilderReady(page);
      const visibleMenuItems = await openTableMoreActionsMenu(page);
      const menuShot = await captureEvidence(page, evidenceDir, 'table-menu');

      return {
        status: 'menu-inspected',
        profile: profile.name,
        storyUrl: targetUrl,
        widgetKey: widget.key,
        evidenceDir,
        title: await page.title(),
        route: page.url(),
        visibleMenuItems,
        artifacts: {
          menu: menuShot
        }
      };
    } catch (error) {
      await captureFailureDiagnostics(page, evidenceDir);
      throw error;
    }
  } finally {
    await session.close();
  }
}

export async function inspectStoryTableCellMenuFromPilot(
  input: ConfigureStoryTableInput = {},
  deps: ConfigureStoryTableDependencies = {}
): Promise<{
  status: 'cell-menu-inspected';
  profile: string;
  storyUrl: string;
  widgetKey: string;
  evidenceDir: string;
  title: string;
  route: string;
  targetLabel: string;
  visibleMenuItems: string[];
  artifacts: { menu: string };
}> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const inspection = await inspectPilotBundle(projectRoot);
  const { widget, storyUrl } = resolveStoryTarget(input, inspection);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const session = await sessionFactory(profile, {
    attachMode: input.attachMode,
    browserDebugUrl: input.browserDebugUrl
  });
  const evidenceDir = path.resolve(input.evidenceDir ?? path.join(profile.defaultEvidenceDir, 'story-inspect-cell-menu'));

  try {
    const page = asInteractivePage(session.page);
    try {
      const targetUrl = new URL(storyUrl, ensureSacAppUrl(profile.tenantUrl)).toString();
      await ensureSacAppShell(session.page, profile.tenantUrl);
      await openSacRoute(session.page, targetUrl);
      await ensureTableBuilderReady(page);
      const inspectionResult = await openTableCellContextMenu(page);
      const menuShot = await captureEvidence(page, evidenceDir, 'table-cell-menu');

      return {
        status: 'cell-menu-inspected',
        profile: profile.name,
        storyUrl: targetUrl,
        widgetKey: widget.key,
        evidenceDir,
        title: await page.title(),
        route: page.url(),
        targetLabel: inspectionResult.targetLabel,
        visibleMenuItems: inspectionResult.visibleMenuItems,
        artifacts: {
          menu: menuShot
        }
      };
    } catch (error) {
      await captureFailureDiagnostics(page, evidenceDir);
      throw error;
    }
  } finally {
    await session.close();
  }
}

export async function inspectStoryTablePropertyGatesFromPilot(
  input: ConfigureStoryTableInput = {},
  deps: ConfigureStoryTableDependencies = {}
): Promise<{
  status: 'property-gates-inspected';
  profile: string;
  storyUrl: string;
  widgetKey: string;
  evidenceDir: string;
  title: string;
  route: string;
  visiblePropertyLabels: string[];
  propertyGates: {
    advancedModeVisible: boolean;
    switchAllTablesToNewBuildExperienceVisible: boolean;
    crossTabVisible: boolean;
    forecastLayoutVisible: boolean;
    nonAggregatedListVisible: boolean;
    adaptiveColumnWidthVisible: boolean;
    arrangeTotalsParentNodesBelowVisible: boolean;
    enableQuickBuilderVisible: boolean;
    enableDataAnalyzerVisible: boolean;
    enableExcelAddInVisible: boolean;
    disableInteractionVisible: boolean;
    dataRefreshVisible: boolean;
  };
  artifacts: { gates: string };
}> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const inspection = await inspectPilotBundle(projectRoot);
  const { widget, storyUrl } = resolveStoryTarget(input, inspection);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const session = await sessionFactory(profile, {
    attachMode: input.attachMode,
    browserDebugUrl: input.browserDebugUrl
  });
  const evidenceDir = path.resolve(input.evidenceDir ?? path.join(profile.defaultEvidenceDir, 'story-inspect-gates'));

  try {
    const page = asInteractivePage(session.page);
    try {
      const targetUrl = new URL(storyUrl, ensureSacAppUrl(profile.tenantUrl)).toString();
      await ensureSacAppShell(session.page, profile.tenantUrl);
      await openSacRoute(session.page, targetUrl);
      await ensureTableBuilderReady(page);
      await selectTableWidget(page);
      const bodyText = await readBodyText(page);
      const gates = inspectVisiblePropertyGates(bodyText);
      const gatesShot = await captureEvidence(page, evidenceDir, 'table-property-gates');

      return {
        status: 'property-gates-inspected',
        profile: profile.name,
        storyUrl: targetUrl,
        widgetKey: widget.key,
        evidenceDir,
        title: await page.title(),
        route: page.url(),
        visiblePropertyLabels: gates.visiblePropertyLabels,
        propertyGates: gates.propertyGates,
        artifacts: {
          gates: gatesShot
        }
      };
    } catch (error) {
      await captureFailureDiagnostics(page, evidenceDir);
      throw error;
    }
  } finally {
    await session.close();
  }
}

export async function configureStoryTableFromPilot(
  input: ConfigureStoryTableInput = {},
  deps: ConfigureStoryTableDependencies = {}
): Promise<{
  status: 'builder-ready';
  profile: string;
  storyUrl: string;
  widgetKey: string;
  modelName: string;
  rows: string[];
  columns: string[];
  filters: Array<{ dimension: string; value: string }>;
  evidenceDir: string;
  title: string;
  route: string;
  bodyPreview: string;
  artifacts: { builder: string };
}> {
  const projectRoot = input.projectRoot ?? process.cwd();
  const inspection = await inspectPilotBundle(projectRoot);
  const { widget, storyUrl } = resolveStoryTarget(input, inspection);
  const paths = deps.paths ?? createConfigPaths();
  const store = deps.store ?? createProfileStore(paths);
  const profile = await store.resolveProfile(input.profileName ?? inspection.proofInputs.tenant.profile);
  const sessionFactory = deps.sessionFactory ?? await createSessionFactory(deps.runtime);
  const session = await sessionFactory(profile, {
    attachMode: input.attachMode,
    browserDebugUrl: input.browserDebugUrl
  });
  const evidenceDir = path.resolve(input.evidenceDir ?? path.join(profile.defaultEvidenceDir, 'story-configure-table'));

  try {
    const page = asInteractivePage(session.page);
    try {
      const targetUrl = new URL(storyUrl, ensureSacAppUrl(profile.tenantUrl)).toString();
      await ensureSacAppShell(session.page, profile.tenantUrl);
      await openSacRoute(session.page, targetUrl);

      await ensureTableBuilderReady(page);
      const insertedTable = await maybeInsertTable(page);
      if (insertedTable) {
        await saveStoryCheckpoint(page, 'inserting the table widget');
      }

      const boundModel = await maybeBindModel(page, widget.model.name);
      if (boundModel) {
        await saveStoryCheckpoint(page, `binding model ${widget.model.name}`);
      }

      const filledVariables = await maybeFillVariables(page);
      if (filledVariables) {
        await saveStoryCheckpoint(page, 'setting story variables');
      }

      await ensureTableBuilderReady(page);
      await ensureRowsAndColumns(page, widget);
      await saveStoryCheckpoint(page, 'configuring table rows and columns');
      await ensureFilters(page, widget);
      await saveStoryCheckpoint(page, 'configuring table filters');
      await ensureTableBuilderReady(page);

      const builderShot = await captureEvidence(page, evidenceDir, 'builder-ready');
      const bodyPreview = (await page.locator('body').innerText()).slice(0, 12000);

      return {
        status: 'builder-ready',
        profile: profile.name,
        storyUrl: targetUrl,
        widgetKey: widget.key,
        modelName: widget.model.name,
        rows: widget.rows,
        columns: widget.columns,
        filters: widget.filters,
        evidenceDir,
        title: await page.title(),
        route: page.url(),
        bodyPreview,
        artifacts: {
          builder: builderShot
        }
      };
    } catch (error) {
      await captureFailureDiagnostics(page, evidenceDir);
      throw error;
    }
  } finally {
    await session.close();
  }
}
