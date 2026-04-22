# SAC CLI W1.7 Wave C — Workflow Capture Tracker

## Purpose
Ship the smallest honest scaling slice: a reusable workflow capture harness that can turn real browser request/response flows into repo-shaped `WorkflowCapture` artifacts, instead of relying on hand-written handover notes.

## Parent-grounded baseline
- Wave A landed: capture/registry schemas and seeded `dataaction.validate` artifacts.
- Wave B landed: replay/diff tooling plus `runtimeMode` honesty and runtime-context retry hardening.
- Current baseline is green:
  - `npm run test`
  - `npm run test:contract`
  - `npm run typecheck`
  - `npm run build`
  - live `npm run cli -- --json --profile decisioninc-live formula validate --root .`

## Wave C objective
Create a minimal workflow capture harness that can capture one winning browser request/response pair with:
- semantic capability name
- route before/after
- runtime tenant context
- request method/url/headers/body
- response status/headers/body
- JSON artifact writeout

## In scope
### New files
- `src/capture/workflow-capture.ts`

### Allowed modifications
- `src/session/browser-session.ts`
- `tests/capture/workflow-capture.spec.ts`
- `tests/session/browser-session.spec.ts` only if a type-level/runtime-level harness assertion is strictly needed

## Explicitly out of scope
- `src/replay/**`
- `src/registry/**`
- `src/cmd/**`
- `src/formula/**`
- `src/pilot/**`
- `src/capture/redaction.ts`
- story/contentlib capability promotion
- any live SAC mutation/copy/save flow
- README churn unless strictly required

## Truth rules
- Scale by workflow, not by endpoint.
- Capture one decisive request/response pair honestly before trying multi-request timelines.
- Keep capability names semantic.
- Prefer library API first; no CLI surface yet.
- Do not invent a fake browser/network SDK. Only add the minimal request/response methods needed.

## Planned browser-surface expansion
- `BrowserRequest.method(): string`
- `BrowserRequest.headers(): Record<string, string>`
- `BrowserResponse.status(): number`
- `BrowserResponse.headers(): Record<string, string>`
- `BrowserResponse.text(): Promise<string>`
- `BrowserResponse.request(): BrowserRequest`
- `BrowserPage.waitForResponse?(predicate, options)`

## TDD order
1. Red test: capture harness records matched request/response, route before/after, runtime context, and writes a JSON artifact.
2. Red test: response body falls back to plain text when JSON parsing fails.
3. Red test: clear failure on capture timeout.
4. Expand browser-session request/response types just enough for the harness.
5. Implement `src/capture/workflow-capture.ts`.
6. Run targeted tests, then full repo verification.

## Verification commands
```bash
npm run test -- tests/capture/workflow-capture.spec.ts tests/session/browser-session.spec.ts tests/session/page-fetch.spec.ts
npm run test
npm run test:contract
npm run typecheck
npm run build
```

## Parent verdict log
- 2026-04-17: tracker created.
- 2026-04-17: Wave C landed for reusable workflow capture; parent verification green.
- 2026-04-17: follow-up hardening landed: live tenantDescription can no longer be overridden by manual context, and perform-step failures are no longer misreported as capture timeouts.
