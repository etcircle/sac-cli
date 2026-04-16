import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createConfigPaths } from '../../src/config/paths.js';
import { createProfileStore } from '../../src/config/profile-store.js';
import { verifyPilotFormula } from '../../src/formula/verify-pilot.js';
import { PILOT_RUNTIME_TENANT_URL, PILOT_PROFILE_NAME, writePilotBundle, PILOT_STEP_SOURCE } from '../helpers/pilot-bundle.js';

async function makeIsolatedHomes() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-formula-'));
  const configHome = path.join(root, 'config-home');
  const dataHome = path.join(root, 'data-home');
  return { root, configHome, dataHome };
}

function createSessionFactory(goto: ReturnType<typeof vi.fn>) {
  return async () => ({
    page: {
      goto,
      url: () => `${PILOT_RUNTIME_TENANT_URL}#editor`,
      screenshot: vi.fn().mockResolvedValue(undefined)
    },
    context: {
      pages: () => [],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined)
    },
    close: vi.fn().mockResolvedValue(undefined),
    takeScreenshot: async (outputPath: string) => {
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, 'fake-screenshot', 'utf8');
      return outputPath;
    }
  });
}

describe('formula verify-pilot service', () => {
  it('reuses the resolved runtime profile tenant, writes manifest artifacts, and proves a stable hash across two runs', async () => {
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
    const probe = vi.fn().mockImplementation(async ({ targetUrl }) => ({
      reopenedUrl: `${targetUrl}&run=stable`,
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
        sessionFactory: createSessionFactory(goto),
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
      repeatabilityStable: true
    });
    expect(result.normalizedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(goto).toHaveBeenCalledTimes(2);
    for (const [targetUrl, options] of goto.mock.calls) {
      expect(targetUrl).toContain('https://runtime.example.invalid/sap/fpa/ui/app.html#/dataaction&/da/PLANNINGSEQUENCE:t.J:FA9020524E79E7C812C4D1E8D41355B/?step=39357048-8119-4677-3365-911086985863');
      expect(options).toEqual({ waitUntil: 'domcontentloaded' });
    }

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
      }
    });
    expect(validationResult).toEqual({
      status: 'unavailable',
      issues: [],
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
          sessionFactory: createSessionFactory(vi.fn().mockResolvedValue(undefined)),
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
      matchesFrozenSource: true,
      normalizedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      machineReadable: true
    });
  });
});
