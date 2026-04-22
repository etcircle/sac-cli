import type { JsonValue, VolatilityClassification, WorkflowCapture } from '../capture/types.js';

export type ReplayDiffKind = 'added' | 'removed' | 'changed';
export type ReplayDiffClassification =
  | 'patch'
  | 'volatile'
  | 'stable-regression'
  | 'unexpected-removal'
  | 'unexpected-addition'
  | 'unexpected-change';

export type ReplayDiffEntry = {
  path: string;
  kind: ReplayDiffKind;
  classification: ReplayDiffClassification;
  before?: JsonValue;
  after?: JsonValue;
};

export type WorkflowCaptureDiffSummary = {
  capability: string;
  baseline: WorkflowCapture['volatility']['baseline'];
  entries: ReplayDiffEntry[];
  counts: Record<ReplayDiffClassification, number>;
  hasStableRegressions: boolean;
  hasUnexpectedDifferences: boolean;
};

const IDENTIFIER_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createEmptyCounts(): Record<ReplayDiffClassification, number> {
  return {
    patch: 0,
    volatile: 0,
    'stable-regression': 0,
    'unexpected-removal': 0,
    'unexpected-addition': 0,
    'unexpected-change': 0
  };
}

function appendObjectPath(path: string, key: string): string {
  return IDENTIFIER_SEGMENT.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function appendArrayPath(path: string, index: number): string {
  return `${path}[${index}]`;
}

function pathMatchesDeclared(path: string, declaredPath: string): boolean {
  return path === declaredPath
    || path.startsWith(`${declaredPath}.`)
    || path.startsWith(`${declaredPath}[`);
}

function pathTouchesDeclared(path: string, declaredPath: string): boolean {
  return pathMatchesDeclared(path, declaredPath)
    || declaredPath.startsWith(`${path}.`)
    || declaredPath.startsWith(`${path}[`);
}

function classifyDiff(
  path: string,
  kind: ReplayDiffKind,
  volatility: VolatilityClassification
): ReplayDiffClassification {
  if (volatility.patchPaths.some((declaredPath) => pathMatchesDeclared(path, declaredPath))) {
    return 'patch';
  }

  if (volatility.volatilePaths.some((declaredPath) => pathTouchesDeclared(path, declaredPath))) {
    return 'volatile';
  }

  if (volatility.stablePaths.some((declaredPath) => pathTouchesDeclared(path, declaredPath))) {
    return 'stable-regression';
  }

  if (kind === 'removed') {
    return 'unexpected-removal';
  }

  if (kind === 'added') {
    return 'unexpected-addition';
  }

  return 'unexpected-change';
}

function pushDiff(
  entries: ReplayDiffEntry[],
  volatility: VolatilityClassification,
  path: string,
  kind: ReplayDiffKind,
  before: JsonValue | undefined,
  after: JsonValue | undefined
): void {
  entries.push({
    path,
    kind,
    classification: classifyDiff(path, kind, volatility),
    before,
    after
  });
}

function collectDiffEntries(
  baseline: JsonValue,
  candidate: JsonValue,
  path: string,
  volatility: VolatilityClassification,
  entries: ReplayDiffEntry[]
): void {
  if (Object.is(baseline, candidate)) {
    return;
  }

  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    const maxLength = Math.max(baseline.length, candidate.length);
    for (let index = 0; index < maxLength; index += 1) {
      const nextPath = appendArrayPath(path, index);
      const inBaseline = index < baseline.length;
      const inCandidate = index < candidate.length;

      if (!inBaseline) {
        pushDiff(entries, volatility, nextPath, 'added', undefined, candidate[index]);
        continue;
      }

      if (!inCandidate) {
        pushDiff(entries, volatility, nextPath, 'removed', baseline[index], undefined);
        continue;
      }

      collectDiffEntries(baseline[index], candidate[index], nextPath, volatility, entries);
    }
    return;
  }

  if (isJsonRecord(baseline) && isJsonRecord(candidate)) {
    const keys = Array.from(new Set([...Object.keys(baseline), ...Object.keys(candidate)])).sort();
    for (const key of keys) {
      const nextPath = appendObjectPath(path, key);
      const inBaseline = Object.prototype.hasOwnProperty.call(baseline, key);
      const inCandidate = Object.prototype.hasOwnProperty.call(candidate, key);

      if (!inBaseline) {
        pushDiff(entries, volatility, nextPath, 'added', undefined, candidate[key]);
        continue;
      }

      if (!inCandidate) {
        pushDiff(entries, volatility, nextPath, 'removed', baseline[key], undefined);
        continue;
      }

      collectDiffEntries(baseline[key], candidate[key], nextPath, volatility, entries);
    }
    return;
  }

  pushDiff(entries, volatility, path, 'changed', baseline, candidate);
}

export function diffWorkflowCapture(
  baseline: WorkflowCapture,
  candidate: WorkflowCapture
): WorkflowCaptureDiffSummary {
  const entries: ReplayDiffEntry[] = [];
  collectDiffEntries(baseline as JsonValue, candidate as JsonValue, '$', baseline.volatility, entries);

  const counts = createEmptyCounts();
  for (const entry of entries) {
    counts[entry.classification] += 1;
  }

  return {
    capability: baseline.capability,
    baseline: baseline.volatility.baseline,
    entries,
    counts,
    hasStableRegressions: counts['stable-regression'] > 0,
    hasUnexpectedDifferences:
      counts['unexpected-removal'] > 0
      || counts['unexpected-addition'] > 0
      || counts['unexpected-change'] > 0
  };
}
