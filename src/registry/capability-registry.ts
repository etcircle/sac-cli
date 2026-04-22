import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import { workflowCaptureSchema, type WorkflowCapture } from '../capture/types.js';
import {
  capabilityRegistryEntrySchema,
  type CapabilityRegistryEntry
} from './schema.js';

export type LoadedCapabilityRegistryEntry = {
  filePath: string;
  projectRoot: string;
  entry: CapabilityRegistryEntry;
  capture: WorkflowCapture;
  artifactPaths: {
    capture: string;
    contractTests: string[];
    documentation: string[];
  };
};

export type CapabilityRegistryLoadOptions = {
  projectRoot?: string;
};

function createCapabilityRegistryInvalidError(message: string): CliError {
  return new CliError(
    'CAPABILITY_REGISTRY_INVALID',
    `Capability registry is invalid: ${message}`,
    ExitCode.InvalidInput
  );
}

async function parseYamlFile<T>(filePath: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return schema.parse(parseYaml(raw));
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createCapabilityRegistryInvalidError(`missing registry file "${path.basename(filePath)}".`);
    }

    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const issuePath = firstIssue?.path.join('.') || 'root';
      throw createCapabilityRegistryInvalidError(
        `"${path.basename(filePath)}" failed schema validation at "${issuePath}": ${firstIssue?.message ?? 'invalid value'}.`
      );
    }

    throw createCapabilityRegistryInvalidError(
      `could not parse "${path.basename(filePath)}": ${error instanceof Error ? error.message : 'unknown parse failure'}.`
    );
  }
}

async function parseJsonFile<T>(filePath: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createCapabilityRegistryInvalidError(`missing capture artifact "${filePath}".`);
    }

    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const issuePath = firstIssue?.path.join('.') || 'root';
      throw createCapabilityRegistryInvalidError(
        `capture artifact "${filePath}" failed schema validation at "${issuePath}": ${firstIssue?.message ?? 'invalid value'}.`
      );
    }

    throw createCapabilityRegistryInvalidError(
      `could not parse capture artifact "${filePath}": ${error instanceof Error ? error.message : 'unknown parse failure'}.`
    );
  }
}

async function assertArtifactExists(projectRoot: string, relativePath: string, label: string): Promise<string> {
  const absolutePath = path.resolve(projectRoot, relativePath);

  try {
    await access(absolutePath);
    return absolutePath;
  } catch {
    throw createCapabilityRegistryInvalidError(`${label} "${relativePath}" does not exist.`);
  }
}

async function findProjectRoot(startPath: string): Promise<string> {
  let current = path.resolve(path.dirname(startPath));

  while (true) {
    try {
      await access(path.join(current, 'package.json'));
      return current;
    } catch {
      // keep walking
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return process.cwd();
    }
    current = parent;
  }
}

function sortByCapability(entries: LoadedCapabilityRegistryEntry[]): LoadedCapabilityRegistryEntry[] {
  return [...entries].sort((left, right) => left.entry.capability.localeCompare(right.entry.capability));
}

export async function loadCapabilityRegistryEntry(
  filePath: string,
  options: CapabilityRegistryLoadOptions = {}
): Promise<LoadedCapabilityRegistryEntry> {
  const resolvedEntryPath = path.resolve(filePath);
  const projectRoot = path.resolve(options.projectRoot ?? await findProjectRoot(resolvedEntryPath));
  const entry = await parseYamlFile(resolvedEntryPath, capabilityRegistryEntrySchema);

  const capturePath = await assertArtifactExists(projectRoot, entry.artifacts.capture, 'capture artifact');
  const contractTests = await Promise.all(
    entry.artifacts.contractTests.map((artifactPath) => assertArtifactExists(projectRoot, artifactPath, 'contract test artifact'))
  );
  const documentation = await Promise.all(
    entry.artifacts.documentation.map((artifactPath) => assertArtifactExists(projectRoot, artifactPath, 'documentation artifact'))
  );
  const capture = await parseJsonFile(capturePath, workflowCaptureSchema);

  if (capture.capability !== entry.capability) {
    throw createCapabilityRegistryInvalidError(
      `registry entry "${entry.capability}" points at capture artifact for "${capture.capability}".`
    );
  }

  return {
    filePath: resolvedEntryPath,
    projectRoot,
    entry,
    capture,
    artifactPaths: {
      capture: capturePath,
      contractTests,
      documentation
    }
  };
}

export async function loadCapabilityRegistry(
  directoryPath: string,
  options: CapabilityRegistryLoadOptions = {}
): Promise<LoadedCapabilityRegistryEntry[]> {
  const resolvedDirectory = path.resolve(directoryPath);
  const entries = (await readdir(resolvedDirectory))
    .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
    .sort();

  const loaded = await Promise.all(
    entries.map((entry) => loadCapabilityRegistryEntry(path.join(resolvedDirectory, entry), options))
  );

  return sortByCapability(loaded);
}
