import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../app/command-guard.js';
import { ExitCode } from '../app/exit-codes.js';
import {
  workflowCaptureSchema,
  type JsonValue,
  type VolatilityClassification,
  type WorkflowCapture
} from './types.js';
import {
  ensureSacAppUrl,
  type BrowserPage,
  type BrowserResponse
} from '../session/browser-session.js';
import { readSacRuntimeContext } from '../session/page-fetch.js';

export type CaptureWorkflowOptions = {
  capability: string;
  tenantUrl: string;
  page: BrowserPage;
  workflow: {
    actor: string;
    label: string;
    intent?: string;
  };
  matchResponse: (response: BrowserResponse) => boolean;
  perform: () => Promise<unknown>;
  artifactPath?: string;
  timeoutMs?: number;
  context?: Record<string, JsonValue>;
  volatility?: Partial<VolatilityClassification>;
  evidence?: {
    redactions?: string[];
    notes?: string[];
  };
};

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && /timed out|timeout .*response/i.test(error.message);
}

function extractRoute(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hash || `${parsed.pathname}${parsed.search}` || parsed.toString();
  } catch {
    return url;
  }
}

function normalizeCapturedUrl(url: string, tenantUrl: string): string {
  try {
    const tenantOrigin = new URL(ensureSacAppUrl(tenantUrl)).origin;
    const parsed = new URL(url, ensureSacAppUrl(tenantUrl));
    if (parsed.origin === tenantOrigin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const REDACTED_HEADER_VALUE = 'REDACTED_HEADER';
const REDACTED_SECRET_VALUE = 'REDACTED_SECRET';
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-csrf-token'
]);

function redactTenantUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `https://tenant.example.invalid${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return 'https://tenant.example.invalid/sap/fpa/ui/app.html';
  }
}

function redactHeaderMap(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? REDACTED_HEADER_VALUE : value
    ])
  );
}

function normalizeJsonString(value: string, tenantUrl: string): string {
  const tenantOrigin = new URL(ensureSacAppUrl(tenantUrl)).origin;
  return value.split(tenantOrigin).join('https://tenant.example.invalid');
}

function redactJsonValue(value: JsonValue | undefined, tenantUrl: string): JsonValue | undefined {
  if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return normalizeJsonString(value, tenantUrl);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry, tenantUrl)) as JsonValue;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (/(token|cookie|authorization|password|secret|csrf)/i.test(key)) {
        return [key, REDACTED_SECRET_VALUE];
      }
      return [key, redactJsonValue(entryValue as JsonValue, tenantUrl)];
    })
  ) as JsonValue;
}

function parseBodyText(raw: string | null | undefined): JsonValue | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return raw;
  }
}

function buildVolatility(input?: Partial<VolatilityClassification>): VolatilityClassification {
  return {
    baseline: input?.baseline ?? 'exact-capture',
    patchStrategy: input?.patchStrategy ?? 'Preserve the exact winning browser payload until replay proves a smaller patch is safe.',
    patchPaths: input?.patchPaths ?? [],
    volatilePaths: input?.volatilePaths ?? ['$..capturedAt'],
    stablePaths: input?.stablePaths ?? [],
    notes: input?.notes ?? []
  };
}

async function waitForMatchingResponse(options: {
  page: BrowserPage;
  matchResponse: (response: BrowserResponse) => boolean;
  perform: () => Promise<unknown>;
  timeoutMs: number;
  capability: string;
}): Promise<BrowserResponse> {
  if (!options.page.waitForResponse) {
    throw new CliError(
      'WORKFLOW_CAPTURE_UNAVAILABLE',
      'The browser page does not expose waitForResponse(); workflow capture cannot observe matched responses.',
      ExitCode.GeneralError
    );
  }

  type CaptureOutcome =
    | { kind: 'perform-ok' }
    | { kind: 'perform-error'; error: unknown }
    | { kind: 'response-ok'; response: BrowserResponse }
    | { kind: 'response-error'; error: unknown }
    | { kind: 'timeout' };

  const outcomes: CaptureOutcome[] = [];
  let resolveNextOutcome: ((outcome: CaptureOutcome) => void) | undefined;
  const pushOutcome = (outcome: CaptureOutcome) => {
    if (resolveNextOutcome) {
      const resolve = resolveNextOutcome;
      resolveNextOutcome = undefined;
      resolve(outcome);
      return;
    }
    outcomes.push(outcome);
  };
  const nextOutcome = () => {
    if (outcomes.length > 0) {
      return Promise.resolve(outcomes.shift() as CaptureOutcome);
    }

    return new Promise<CaptureOutcome>((resolve) => {
      resolveNextOutcome = resolve;
    });
  };

  options.page.waitForResponse(options.matchResponse, { timeout: options.timeoutMs }).then(
    (response) => pushOutcome({ kind: 'response-ok', response }),
    (error) => pushOutcome({ kind: 'response-error', error })
  );
  Promise.resolve().then(options.perform).then(
    () => pushOutcome({ kind: 'perform-ok' }),
    (error) => pushOutcome({ kind: 'perform-error', error })
  );
  const timeoutHandle = setTimeout(() => {
    pushOutcome({ kind: 'timeout' });
  }, options.timeoutMs);

  let performCompleted = false;
  let matchedResponse: BrowserResponse | null = null;

  while (true) {
    const outcome = await nextOutcome();

    if (outcome.kind === 'perform-error') {
      clearTimeout(timeoutHandle);
      throw outcome.error;
    }

    if (outcome.kind === 'response-error') {
      clearTimeout(timeoutHandle);
      if (isTimeoutError(outcome.error)) {
        throw new CliError(
          'WORKFLOW_CAPTURE_TIMEOUT',
          `Timed out waiting for a matching browser response while capturing "${options.capability}".`,
          ExitCode.GeneralError
        );
      }
      throw outcome.error;
    }

    if (outcome.kind === 'timeout') {
      throw new CliError(
        'WORKFLOW_CAPTURE_TIMEOUT',
        `Timed out waiting for a matching browser response while capturing "${options.capability}".`,
        ExitCode.GeneralError
      );
    }

    if (outcome.kind === 'response-ok') {
      if (performCompleted) {
        clearTimeout(timeoutHandle);
        return outcome.response;
      }
      matchedResponse = outcome.response;
      continue;
    }

    performCompleted = true;
    if (matchedResponse) {
      clearTimeout(timeoutHandle);
      return matchedResponse;
    }
  }
}

async function maybeWriteArtifact(artifactPath: string | undefined, capture: WorkflowCapture): Promise<void> {
  if (!artifactPath) {
    return;
  }

  const resolvedArtifactPath = path.resolve(artifactPath);
  await mkdir(path.dirname(resolvedArtifactPath), { recursive: true });
  await writeFile(resolvedArtifactPath, `${JSON.stringify(capture, null, 2)}\n`, 'utf8');
}

export async function captureWorkflow(options: CaptureWorkflowOptions): Promise<WorkflowCapture> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const routeBefore = extractRoute(options.page.url());
  const response = await waitForMatchingResponse({
    page: options.page,
    matchResponse: options.matchResponse,
    perform: options.perform,
    timeoutMs,
    capability: options.capability
  });
  const routeAfter = extractRoute(options.page.url());
  const request = response.request();
  const runtime = await readSacRuntimeContext(options.page, undefined, { timeoutMs: options.timeoutMs });
  const runtimeContext: Record<string, JsonValue> = {
    ...(options.context ?? {}),
    ...(runtime.tenantDescription === null ? {} : { tenantDescription: runtime.tenantDescription })
  };

  const capture = workflowCaptureSchema.parse({
    schemaVersion: 1,
    capability: options.capability,
    capturedAt: new Date().toISOString(),
    workflow: {
      actor: options.workflow.actor,
      label: options.workflow.label,
      intent: options.workflow.intent
    },
    route: {
      before: routeBefore,
      after: routeAfter
    },
    runtimeContext: {
      tenantUrl: redactTenantUrl(ensureSacAppUrl(options.tenantUrl)),
      tenantId: runtime.tenantId,
      route: routeAfter,
      csrfTokenPresent: runtime.csrfToken !== null,
      context: redactJsonValue(runtimeContext, options.tenantUrl)
    },
    request: {
      method: request.method(),
      url: normalizeCapturedUrl(request.url(), options.tenantUrl),
      headers: redactHeaderMap(request.headers()),
      body: redactJsonValue(parseBodyText(request.postData()), options.tenantUrl)
    },
    response: {
      status: response.status(),
      headers: redactHeaderMap(response.headers()),
      body: redactJsonValue(parseBodyText(await response.text()), options.tenantUrl)
    },
    volatility: buildVolatility(options.volatility),
    evidence: {
      source: 'browser-capture',
      redactions: options.evidence?.redactions ?? [],
      notes: options.evidence?.notes ?? []
    }
  });

  await maybeWriteArtifact(options.artifactPath, capture);
  return capture;
}
