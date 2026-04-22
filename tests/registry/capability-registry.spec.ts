import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { capabilityRegistryEntrySchema } from '../../src/registry/schema.js';
import {
  loadCapabilityRegistry,
  loadCapabilityRegistryEntry
} from '../../src/registry/capability-registry.js';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixtureEntryPath = fileURLToPath(
  new URL('../../fixtures/redacted/dataaction.validate/registry-entry.yaml', import.meta.url)
);

describe('capability registry loader', () => {
  it('loads the seeded dataaction.validate registry entry and linked capture artifact', async () => {
    const loaded = await loadCapabilityRegistryEntry(fixtureEntryPath, { projectRoot });

    expect(loaded.entry.capability).toBe('dataaction.validate');
    expect(loaded.entry.status).toBe('promoted');
    expect(loaded.entry.payloadStrategy.baseline).toBe('exact-capture-plus-patch');
    expect(loaded.entry.artifacts.contractTests).toEqual(['tests/contract/objectmgr.validate.spec.ts']);
    expect(loaded.capture.capability).toBe('dataaction.validate');
    expect(loaded.capture.volatility.patchPaths).toEqual(
      loaded.entry.payloadStrategy.patchPaths
    );
  });

  it('discovers the repo root from the entry path when projectRoot is omitted', async () => {
    const originalCwd = process.cwd();
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-capability-registry-cwd-'));

    try {
      process.chdir(tempRoot);
      const loaded = await loadCapabilityRegistryEntry(fixtureEntryPath);
      expect(loaded.projectRoot).toBe(path.resolve(projectRoot));
      expect(loaded.artifactPaths.capture).toContain('fixtures/redacted/dataaction.validate/capture.json');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('loads registry entries from a directory in stable capability order', async () => {
    const loaded = await loadCapabilityRegistry(path.dirname(fixtureEntryPath), { projectRoot });

    expect(loaded.map((entry) => entry.entry.capability)).toEqual(['dataaction.validate']);
  });

  it('rejects malformed semantic capability names at schema level', () => {
    expect(() => capabilityRegistryEntrySchema.parse({
      schemaVersion: 1,
      capability: 'objectmgr/validate',
      title: 'Bad capability',
      summary: 'Should fail because capability names must stay semantic.',
      status: 'captured',
      lane: 'hybrid',
      underlyingSeam: {
        method: 'POST',
        endpoint: '/sap/fpa/services/rest/epm/objectmgr?tenant=J',
        action: 'callFunction:PLANNINGSEQUENCE.validate'
      },
      prerequisites: {
        route: '#/dataaction',
        auth: 'browser-backed session',
        runtime: ['tenantId']
      },
      artifacts: {
        capture: 'fixtures/redacted/dataaction.validate/capture.json',
        contractTests: ['tests/contract/objectmgr.validate.spec.ts'],
        documentation: ['docs/capabilities/dataaction.validate.md']
      },
      payloadStrategy: {
        baseline: 'exact-capture-plus-patch',
        patchPaths: ['$.request.body.data[2][0].sequenceMetadata.planningSteps[0].scriptContent'],
        volatility: {
          volatilePaths: ['$.capturedAt'],
          stablePaths: ['$.request.body.data[0]'],
          syntheticPayloadReliability: 'unreliable'
        },
        notes: ['Minimal synthetic payloads are unreliable.']
      },
      proof: {
        contract: {
          status: 'present',
          tests: ['tests/contract/objectmgr.validate.spec.ts']
        },
        live: {
          status: 'verified',
          summary: 'Verified against the live tenant via formula validate.'
        },
        notes: ['Exact capture plus surgical patch is the honest baseline.']
      },
      knownFailureModes: ['Minimal synthetic payloads can return garbage validation or 500s.']
    })).toThrow();
  });

  it('fails loudly when a registry entry points at a missing capture artifact', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sac-cli-capability-registry-'));
    const entryPath = path.join(tempRoot, 'registry-entry.yaml');

    await writeFile(entryPath, `schemaVersion: 1
capability: dataaction.validate
title: Data action validate
summary: Captured validate replay.
status: captured
lane: hybrid
underlyingSeam:
  method: POST
  endpoint: /sap/fpa/services/rest/epm/objectmgr?tenant=J
  action: callFunction:PLANNINGSEQUENCE.validate
prerequisites:
  route: '#/dataaction&/edit/FA9020524E79E7C812C4D1E8D41355B'
  auth: browser-backed SAC session with runtime context
  runtime:
    - tenantId
    - csrfToken
artifacts:
  capture: fixtures/redacted/dataaction.validate/missing-capture.json
  contractTests:
    - tests/contract/objectmgr.validate.spec.ts
  documentation:
    - docs/capabilities/dataaction.validate.md
payloadStrategy:
  baseline: exact-capture-plus-patch
  patchPaths:
    - $.request.body.data[2][0].sequenceMetadata.planningSteps[0].scriptContent
  volatility:
    volatilePaths:
      - $.capturedAt
    stablePaths:
      - $.request.body.data[0]
    syntheticPayloadReliability: unreliable
  notes:
    - Preserve the captured payload and patch only scriptContent.
proof:
  contract:
    status: present
    tests:
      - tests/contract/objectmgr.validate.spec.ts
  live:
    status: verified
    summary: Verified in the live tenant.
  notes:
    - Capture is the baseline.
knownFailureModes:
  - Minimal synthetic payloads are unreliable.
`, 'utf8');

    await expect(loadCapabilityRegistryEntry(entryPath, { projectRoot })).rejects.toThrow(/capture artifact/i);
  });
});
