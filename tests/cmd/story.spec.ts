import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cmd/root.js';
import { ExitCode } from '../../src/app/exit-codes.js';

const successEnvelope = {
  ok: true,
  data: {
    status: 'builder-ready',
    profile: 'pilot-sandbox',
    storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    widgetKey: 'forecast-table',
    modelName: 'C_REPORTING',
    rows: ['Reporting Account', 'Company Code - DI Consol'],
    columns: ['Audittrail - DI Consol', 'Date', 'Measures'],
    filters: [{ dimension: 'Version', value: 'Forecast' }],
    evidenceDir: '/tmp/evidence',
    title: 'Story',
    route: '#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    bodyPreview: 'builder text',
    artifacts: { builder: '/tmp/evidence/builder-ready.png' }
  }
};

const inspectMenuEnvelope = {
  ok: true,
  data: {
    status: 'menu-inspected',
    profile: 'pilot-sandbox',
    storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    widgetKey: 'forecast-table',
    evidenceDir: '/tmp/evidence',
    title: 'Story',
    route: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    visibleMenuItems: ['Applied to Table', 'Edit Scripts...', 'Copy', 'Export'],
    artifacts: { menu: '/tmp/evidence/table-menu.png' }
  }
};

const inspectCellMenuEnvelope = {
  ok: true,
  data: {
    status: 'cell-menu-inspected',
    profile: 'pilot-sandbox',
    storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    widgetKey: 'forecast-table',
    evidenceDir: '/tmp/evidence',
    title: 'Story',
    route: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    targetLabel: 'Net Revenue',
    visibleMenuItems: ['Jump To', 'Create Visibility Filter', 'Sort'],
    artifacts: { menu: '/tmp/evidence/table-cell-menu.png' }
  }
};

const inspectGatesEnvelope = {
  ok: true,
  data: {
    status: 'property-gates-inspected',
    profile: 'pilot-sandbox',
    storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    widgetKey: 'forecast-table',
    evidenceDir: '/tmp/evidence',
    title: 'Story',
    route: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
    visiblePropertyLabels: ['Cross-tab', 'Adaptive Column Width', 'Enable Data Analyzer'],
    propertyGates: {
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
    },
    artifacts: { gates: '/tmp/evidence/table-property-gates.png' }
  }
};

describe('story command wiring', () => {
  it('routes story configure-table through the story services dependency', async () => {
    const configureTable = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      [
        '--json',
        '--profile',
        'pilot-sandbox',
        'story',
        'configure-table',
        '--root',
        '/tmp/project',
        '--story-url',
        'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
        '--evidence-dir',
        '/tmp/evidence',
        '--widget-key',
        'forecast-table',
        '--browser-debug-url',
        'http://127.0.0.1:9333',
        '--attach-mode',
        'attach-only'
      ],
      {
        storyServices: {
          configureTable
        }
      }
    );

    expect(configureTable).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
      evidenceDir: '/tmp/evidence',
      widgetKey: 'forecast-table',
      profileName: 'pilot-sandbox',
      browserDebugUrl: 'http://127.0.0.1:9333',
      attachMode: 'attach-only'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('routes story table configure through the story services dependency', async () => {
    const configureTable = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      [
        '--json',
        '--profile',
        'pilot-sandbox',
        'story',
        'table',
        'configure',
        '--root',
        '/tmp/project',
        '--browser-debug-url',
        'http://127.0.0.1:9333',
        '--attach-mode',
        'attach-first'
      ],
      {
        storyServices: {
          configureTable
        }
      }
    );

    expect(configureTable).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      profileName: 'pilot-sandbox',
      browserDebugUrl: 'http://127.0.0.1:9333',
      attachMode: 'attach-first'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('keeps configure defaults unchanged when no attach flags are provided', async () => {
    const configureTable = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'story', 'table', 'configure', '--root', '/tmp/project'],
      {
        storyServices: {
          configureTable
        }
      }
    );

    expect(configureTable).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('routes story table add-row-dimension through the story services dependency', async () => {
    const addRowDimension = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'story', 'table', 'add-row-dimension', '--dimension', 'Functional Area', '--root', '/tmp/project', '--story-url', 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit'],
      {
        storyServices: {
          addRowDimension
        }
      }
    );

    expect(addRowDimension).toHaveBeenCalledWith({
      dimension: 'Functional Area',
      projectRoot: '/tmp/project',
      storyUrl: 'https://tenant.example.invalid/sap/fpa/ui/app.html#/story2&/s2/ABC/?type=RESPONSIVE&mode=edit',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('routes story table add-column-dimension through the story services dependency', async () => {
    const addColumnDimension = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'story', 'table', 'add-column-dimension', '--dimension', 'Entity', '--widget-key', 'forecast-table'],
      {
        storyServices: {
          addColumnDimension
        }
      }
    );

    expect(addColumnDimension).toHaveBeenCalledWith({
      dimension: 'Entity',
      widgetKey: 'forecast-table',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('routes story table set-filter through the story services dependency', async () => {
    const setFilter = vi.fn().mockResolvedValue(successEnvelope);

    const result = await runCli(
      ['--json', '--profile', 'pilot-sandbox', 'story', 'table', 'set-filter', '--dimension', 'Version', '--value', 'Forecast', '--evidence-dir', '/tmp/evidence'],
      {
        storyServices: {
          setFilter
        }
      }
    );

    expect(setFilter).toHaveBeenCalledWith({
      dimension: 'Version',
      value: 'Forecast',
      evidenceDir: '/tmp/evidence',
      profileName: 'pilot-sandbox'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(successEnvelope);
  });

  it('routes story table inspect-menu through the story services dependency', async () => {
    const inspectMenu = vi.fn().mockResolvedValue(inspectMenuEnvelope);

    const result = await runCli(
      [
        '--json',
        '--profile',
        'pilot-sandbox',
        'story',
        'table',
        'inspect-menu',
        '--root',
        '/tmp/project',
        '--widget-key',
        'forecast-table',
        '--browser-debug-url',
        'http://127.0.0.1:9333',
        '--attach-mode',
        'attach-only'
      ],
      {
        storyServices: {
          inspectMenu
        }
      }
    );

    expect(inspectMenu).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      widgetKey: 'forecast-table',
      profileName: 'pilot-sandbox',
      browserDebugUrl: 'http://127.0.0.1:9333',
      attachMode: 'attach-only'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(inspectMenuEnvelope);
  });

  it('routes story table inspect-cell-menu through the story services dependency', async () => {
    const inspectCellMenu = vi.fn().mockResolvedValue(inspectCellMenuEnvelope);

    const result = await runCli(
      [
        '--json',
        '--profile',
        'pilot-sandbox',
        'story',
        'table',
        'inspect-cell-menu',
        '--root',
        '/tmp/project',
        '--widget-key',
        'forecast-table',
        '--browser-debug-url',
        'http://127.0.0.1:9333',
        '--attach-mode',
        'attach-first'
      ],
      {
        storyServices: {
          inspectCellMenu
        }
      }
    );

    expect(inspectCellMenu).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      widgetKey: 'forecast-table',
      profileName: 'pilot-sandbox',
      browserDebugUrl: 'http://127.0.0.1:9333',
      attachMode: 'attach-first'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(inspectCellMenuEnvelope);
  });

  it('routes story table inspect-gates through the story services dependency', async () => {
    const inspectGates = vi.fn().mockResolvedValue(inspectGatesEnvelope);

    const result = await runCli(
      [
        '--json',
        '--profile',
        'pilot-sandbox',
        'story',
        'table',
        'inspect-gates',
        '--root',
        '/tmp/project',
        '--widget-key',
        'forecast-table',
        '--browser-debug-url',
        'http://127.0.0.1:9333',
        '--attach-mode',
        'attach-first'
      ],
      {
        storyServices: {
          inspectGates
        }
      }
    );

    expect(inspectGates).toHaveBeenCalledWith({
      projectRoot: '/tmp/project',
      widgetKey: 'forecast-table',
      profileName: 'pilot-sandbox',
      browserDebugUrl: 'http://127.0.0.1:9333',
      attachMode: 'attach-first'
    });
    expect(result.exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(result.stdout)).toEqual(inspectGatesEnvelope);
  });

  it('lists table commands in story help output', async () => {
    const result = await runCli(['story', '--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('configure-table');
    expect(result.stdout).toContain('table');
  });

  it('shows attach options in story configure-table help output', async () => {
    const result = await runCli(['story', 'configure-table', '--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('--browser-debug-url <url>');
    expect(result.stdout).toContain('--attach-mode <launch|attach-first|attach-only>');
  });

  it('lists generic table subcommands in story table help output', async () => {
    const result = await runCli(['story', 'table', '--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('configure');
    expect(result.stdout).toContain('add-row-dimension');
    expect(result.stdout).toContain('add-column-dimension');
    expect(result.stdout).toContain('set-filter');
    expect(result.stdout).toContain('inspect-menu');
    expect(result.stdout).toContain('inspect-cell-menu');
    expect(result.stdout).toContain('inspect-gates');
    expect(result.stdout).not.toContain('set-filter.version');
  });

  it('shows attach options in story table configure help output', async () => {
    const result = await runCli(['story', 'table', 'configure', '--help']);

    expect(result.exitCode).toBe(ExitCode.Success);
    expect(result.stdout).toContain('--browser-debug-url <url>');
    expect(result.stdout).toContain('--attach-mode <launch|attach-first|attach-only>');
  });
});
