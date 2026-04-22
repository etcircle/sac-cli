import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { probeFormulaEditorViaDom, verifyPilotFormula } from '../../src/formula/verify-pilot.js';
import { PILOT_RUNTIME_TENANT_URL, PILOT_PROFILE_NAME, writePilotBundle, PILOT_STEP_SOURCE } from '../helpers/pilot-bundle.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-formula-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

function createSessionFactory(input: {
  goto?: ReturnType<typeof vi.fn>;
  evaluate?: ReturnType<typeof vi.fn>;
  close?: ReturnType<typeof vi.fn>;
}) {
  const goto = input.goto ?? vi.fn().mockResolvedValue(undefined);
  const evaluate = input.evaluate;
  const close = input.close ?? vi.fn().mockResolvedValue(undefined);
  let currentUrl = 'about:blank';

  return async () => ({
    page: {
      goto: vi.fn().mockImplementation(async (targetUrl: string, _options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle' }) => {
        await goto(targetUrl, _options);
        currentUrl = targetUrl;
      }),
      url: () => currentUrl,
      screenshot: vi.fn().mockResolvedValue(undefined),
      ...(evaluate ? {
        evaluate: vi.fn().mockImplementation(async (pageFunction: (arg: { hash: string }) => unknown, arg: { hash: string }) => {
          await evaluate(pageFunction, arg);
          if (arg && typeof arg.hash === 'string') {
            currentUrl = `${PILOT_RUNTIME_TENANT_URL}${arg.hash}`;
          }
          return null;
        })
      } : {})
    },
    context: {
      pages: () => [],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    },
    close,
    takeScreenshot: async (outputPath: string) => {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'fake-screenshot', 'utf8');
      return outputPath;
    }
  });
}

describe('formula verify-pilot service', () => {
  it('serializes the DOM probe without tsx __name helpers in the browser callback', async () => {
    let serializedCallback = '';

    await probeFormulaEditorViaDom({
      page: {
        goto: vi.fn(),
        url: () => `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
        screenshot: vi.fn(),
        evaluate: vi.fn().mockImplementation(async (pageFunction) => {
          serializedCallback = String(pageFunction);
          return {
            currentUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
            title: 'Editor',
            expectedSource: PILOT_STEP_SOURCE,
            editorCandidates: [
              {
                selector: '.monaco-editor .view-lines',
                value: PILOT_STEP_SOURCE,
                visible: true
              }
            ],
            validationMessages: []
          };
        })
      },
      inspection: {} as never,
      expectedSource: PILOT_STEP_SOURCE,
      targetUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`
    });

    expect(serializedCallback).not.toContain('__name');
  });

  it('rejects the DOM probe when the reopened route drifts away from the target editor route', async () => {
    await expect(
      probeFormulaEditorViaDom({
        page: {
          goto: vi.fn(),
          url: () => `${PILOT_RUNTIME_TENANT_URL}#wrong-route`,
          screenshot: vi.fn(),
          evaluate: vi.fn().mockResolvedValue({
            currentUrl: `${PILOT_RUNTIME_TENANT_URL}#wrong-route`,
            title: 'Wrong Route',
            expectedSource: PILOT_STEP_SOURCE,
            editorCandidates: [
              {
                selector: '.monaco-editor .view-lines',
                value: PILOT_STEP_SOURCE,
                visible: true
              }
            ],
            validationMessages: []
          })
        },
        inspection: {} as never,
        expectedSource: PILOT_STEP_SOURCE,
        targetUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`
      })
    ).rejects.toThrow(/reopened editor route/i);
  });

  it('rejects a visible non-editor exact match instead of treating it as editor truth', async () => {
    await expect(
      probeFormulaEditorViaDom({
        page: {
          goto: vi.fn(),
          url: () => `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
          screenshot: vi.fn(),
          evaluate: vi.fn().mockResolvedValue({
            currentUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
            title: 'Editor',
            expectedSource: PILOT_STEP_SOURCE,
            editorCandidates: [
              {
                selector: '[class*="formula"]',
                value: PILOT_STEP_SOURCE,
                visible: true
              }
            ],
            validationMessages: []
          })
        },
        inspection: {} as never,
        expectedSource: PILOT_STEP_SOURCE,
        targetUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`
      })
    ).rejects.toThrow(/could not read advanced formula text/i);
  });

  it('falls back to parsing numbered formula lines from the visible page body when editor nodes are absent', async () => {
    const result = await probeFormulaEditorViaDom({
      page: {
        goto: vi.fn(),
        url: () => `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
        screenshot: vi.fn(),
        evaluate: vi.fn().mockResolvedValue({
          currentUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
          title: 'Data Actions - SAP Analytics Cloud',
          expectedSource: PILOT_STEP_SOURCE,
          editorCandidates: [],
          validationMessages: [],
          bodyText: [
            'Data Actions',
            'FX_TRANS',
            'Advanced Formulas Step',
            'Format',
            '//',
            '1',
            'CONFIG.GENERATE_UNBOOKED_DATA = OFF',
            '2',
            'MEMBERSET [d/Measures] = "AMOUNT_YTD"',
            '3',
            'MEMBERSET [d/C_CURRENCY] = "LC"',
            '4',
            'MEMBERSET [d/C_COMP_CODE] = BASEMEMBER([d/C_COMP_CODE], %C_COMP_CODE%)',
            '5',
            'MEMBERSET [d/Date] = BASEMEMBER([d/Date].[h/FYP], %Date%)',
            '6',
            'MEMBERSET [d/C_AUDITTRAIL] = BASEMEMBER([d/C_AUDITTRAIL].[h/PARENTH1], "AU_CONSOL_TOT")',
            '7',
            'MEMBERSET [d/C_ACC] = BASEMEMBER([d/C_ACC].[h/parentId], %C_ACC%)',
            '8',
            'VARIABLEMEMBER #FL_MVT_AVG OF [d/C_FLOW]',
            '9',
            'VARIABLEMEMBER #FL_MVT_OPE OF [d/C_FLOW]',
            '10',
            'VARIABLEMEMBER #FL_MVT_ACQ OF [d/C_FLOW]',
            '11',
            'VARIABLEMEMBER #FL_MVT_ACQ_RCUR OF [d/C_FLOW]',
            '12',
            '​',
            '13',
            '​',
            '14',
            '// ----- Start: delete target intersections -----',
            '15',
            'IF [d/C_ACC].[p/C_RATETYPE] = ("HISFLOW", "RESFLOW", "CTAFLOW")',
            '16',
            '   AND [d/C_FLOW].[p/DIMLIST_FX] = "CONV_OPE" THEN',
            '17',
            '    // Keep opening balances sourced from COPYOPE.',
            '18',
            'ELSE',
            '19',
            '    DELETE([d/C_CURRENCY] = %TargetCurrency%)',
            '20',
            'ENDIF',
            'No errors found'
          ].join('\n')
        })
      },
      inspection: {} as never,
      expectedSource: PILOT_STEP_SOURCE,
      targetUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`
    });

    expect(result.selectorUsed).toBe('body-innerText');
    expect(result.readbackText).toContain('CONFIG.GENERATE_UNBOOKED_DATA = OFF');
    expect(result.readbackText).toContain('DELETE([d/C_CURRENCY] = %TargetCurrency%)');
  });

  it('ignores hidden exact-match candidates and prefers a visible editor surface', async () => {
    const result = await probeFormulaEditorViaDom({
      page: {
        goto: vi.fn(),
        url: () => `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
        screenshot: vi.fn(),
        evaluate: vi.fn().mockResolvedValue({
          currentUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`,
          title: 'Editor',
          expectedSource: PILOT_STEP_SOURCE,
          editorCandidates: [
            {
              selector: '.hidden-preview',
              value: PILOT_STEP_SOURCE,
              visible: false
            },
            {
              selector: '.monaco-editor .view-lines',
              value: PILOT_STEP_SOURCE,
              visible: true
            }
          ],
          validationMessages: []
        })
      },
      inspection: {} as never,
      expectedSource: PILOT_STEP_SOURCE,
      targetUrl: `${PILOT_RUNTIME_TENANT_URL}#/dataaction&/da/expected`
    });

    expect(result.selectorUsed).toBe('.monaco-editor .view-lines');
  });

  it('bootstraps the SAC shell once and reuses a single session across both verify runs', async () => {
    const homes = await makeIsolatedHomes();
    const bundleRoot = await writePilotBundle(homes.root);
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);
    await store.saveProfile({
      name: PILOT_PROFILE_NAME,
      tenantUrl: PILOT_RUNTIME_TENANT_URL,
      defaultAccount: 'pilot@example.invalid',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir(PILOT_PROFILE_NAME),
      defaultEvidenceDir: paths.evidenceDir(PILOT_PROFILE_NAME)
    });

    const goto = vi.fn().mockResolvedValue(undefined);
    const evaluate = vi.fn().mockResolvedValue(undefined);
    const close = vi.fn().mockResolvedValue(undefined);
    const sessionFactory = vi.fn(createSessionFactory({ goto, evaluate, close }));
    const probe = vi.fn().mockImplementation(async ({ targetUrl }) => ({
      reopenedUrl: targetUrl,
      readbackText: `${PILOT_STEP_SOURCE}\n`,
      selectorUsed: '.monaco-editor .view-lines',
      validation: {
        status: 'unavailable',
        issues: []
      }
    }));
    const evidenceDir = path.join(homes.root, 'evidence-output');

    const result = await verifyPilotFormula(
      {
        projectRoot: homes.root,
        evidenceDir
      },
      {
        paths,
        store,
        sessionFactory,
        probe
      }
    );

    expect(result).toMatchObject({
      status: 'readback-stable',
      mode: 'non-mutating',
      profile: PILOT_PROFILE_NAME,
      bundleRoot,
      evidenceDir,
      matchesFrozenSource: true,
      validationStatus: 'unavailable',
      validationSource: 'dom-fallback',
      repeatabilityStable: true
    });
    expect(result.normalizedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledWith(
      'https://runtime.example.invalid/sap/fpa/ui/app.html',
      { waitUntil: 'domcontentloaded' }
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0]?.[1]).toEqual({
      hash: '#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863'
    });
    expect(probe).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);

    const normalizedReadback = JSON.parse(await readFile(path.join(evidenceDir, 'normalized-readback.json'), 'utf8'));
    const reopenCheck = JSON.parse(await readFile(path.join(evidenceDir, 'reopen-check.json'), 'utf8'));
    const validationResult = JSON.parse(await readFile(path.join(evidenceDir, 'validation-result.json'), 'utf8'));
    const runLog = await readFile(path.join(evidenceDir, 'run.log'), 'utf8');

    expect(normalizedReadback).toMatchObject({
      mode: 'non-mutating',
      comparison: {
        matchesFrozenSource: true
      },
      validation: {
        status: 'unavailable',
        issues: []
      },
      validationSource: 'dom-fallback',
      normalizedHash: result.normalizedHash
    });
    expect(reopenCheck).toMatchObject({
      mode: 'non-mutating',
      profile: PILOT_PROFILE_NAME,
      resolvedTenantUrl: PILOT_RUNTIME_TENANT_URL,
      repeatability: {
        stable: true,
        stableHash: result.normalizedHash,
        hashes: [result.normalizedHash, result.normalizedHash]
      },
      validationSource: 'dom-fallback'
    });
    expect(validationResult).toEqual({
      status: 'unavailable',
      issues: [],
      validationSource: 'dom-fallback',
      matchesFrozenSource: true,
      normalizedHash: result.normalizedHash,
      machineReadable: true
    });
    expect(runLog).toContain('command=formula verify-pilot');
    expect(runLog).toContain('mode=non-mutating');
    expect(runLog).toContain(`normalizedHash=${result.normalizedHash}`);
    expect(result.artifacts).toEqual({
      'normalized-readback.json': path.join(evidenceDir, 'normalized-readback.json'),
      'validation-result.json': path.join(evidenceDir, 'validation-result.json'),
      'reopen-check.json': path.join(evidenceDir, 'reopen-check.json'),
      'screenshots/editor.png': path.join(evidenceDir, 'screenshots', 'editor.png'),
      'run.log': path.join(evidenceDir, 'run.log')
    });
  });

  it('writes machine-readable invalid validation artifacts before failing the command', async () => {
    const homes = await makeIsolatedHomes();
    await writePilotBundle(homes.root);
    const paths = createConfigPaths({
      ...process.env,
      SAC_CLI_CONFIG_HOME: homes.configHome,
      SAC_CLI_DATA_HOME: homes.dataHome
    });
    const store = createProfileStore(paths);
    await store.saveProfile({
      name: PILOT_PROFILE_NAME,
      tenantUrl: PILOT_RUNTIME_TENANT_URL,
      defaultAccount: 'pilot@example.invalid',
      browserChannel: 'chrome',
      userDataDir: paths.browserUserDataDir(PILOT_PROFILE_NAME),
      defaultEvidenceDir: paths.evidenceDir(PILOT_PROFILE_NAME)
    });

    const evidenceDir = path.join(homes.root, 'invalid-evidence');

    await expect(
      verifyPilotFormula(
        {
          projectRoot: homes.root,
          evidenceDir
        },
        {
          paths,
          store,
          sessionFactory: createSessionFactory({ goto: vi.fn().mockResolvedValue(undefined) }),
          probe: vi.fn().mockResolvedValue({
            reopenedUrl: `${PILOT_RUNTIME_TENANT_URL}#editor`,
            readbackText: PILOT_STEP_SOURCE,
            selectorUsed: '.monaco-editor .view-lines',
            validation: {
              status: 'invalid',
              issues: [
                {
                  code: 'AF_PARSE_ERROR',
                  message: 'Unexpected token near DELETE',
                  severity: 'error',
                  line: 20,
                  column: 5
                }
              ]
            }
          })
        }
      )
    ).rejects.toMatchObject({
      code: 'FORMULA_VALIDATION_INVALID',
      exitCode: 1
    });

    const validationArtifact = JSON.parse(await readFile(path.join(evidenceDir, 'validation-result.json'), 'utf8'));
    expect(validationArtifact).toEqual({
      status: 'invalid',
      issues: [
        {
          code: 'AF_PARSE_ERROR',
          message: 'Unexpected token near DELETE',
          severity: 'error',
          line: 20,
          column: 5
        }
      ],
      validationSource: 'dom-fallback',
      matchesFrozenSource: true,
      normalizedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      machineReadable: true
    });
  });
});
