# `dataaction.validate`

## Status
- semantic capability: `dataaction.validate`
- registry status: `promoted`
- execution lane: `hybrid`
- current CLI exposure: `formula validate`

## What it honestly does
Validates a data action advanced-formula step through the `objectmgr` seam.

Preferred path:
- replay the browser-captured `objectmgr validate` request
- patch only the target step `scriptContent`

Fallback path:
- when no suitable browser request is captured, use the narrower single-step validate request
- runtime output now reports which path it used

## Underlying seam
- method: `POST`
- endpoint: `/sap/fpa/services/rest/epm/objectmgr?tenant=J`
- action: `callFunction:PLANNINGSEQUENCE.validate`

## Honest baseline
Minimal synthetic payloads were unreliable during live testing.

The reliable baseline is:
1. capture the exact request the SAC browser session sent
2. preserve sibling-step metadata, prompt values, and surrounding sequence flags
3. patch only the target step `scriptContent`

## Artifacts
- capture fixture: `fixtures/redacted/dataaction.validate/capture.json`
- registry entry: `fixtures/redacted/dataaction.validate/registry-entry.yaml`
- contract test:
  - `tests/contract/objectmgr.validate.spec.ts`
- service/runtime proof:
  - `tests/formula/validate.spec.ts`
- CLI passthrough proof:
  - `tests/cmd/formula.spec.ts`

## Proof notes
- live proof: validated on 2026-04-16 through the `formula validate` flow against a live SAC tenant
- contract proof: replay and normalization are covered by the existing objectmgr/formula tests
- runtime mode reporting:
  - `captured-request-replay` = browser request captured and patched surgically
  - `single-step-fallback` = no suitable request captured; runtime used a narrower single-step validate call

## Known failure modes
- hand-minimized payloads can return garbage validation output or `500`s
- missing route context or CSRF state prevents honest replay
- broad payload surgery risks breaking prompt and sibling-step semantics
- `single-step-fallback` is narrower than captured replay and should not be treated as proof that prompt/sibling-step semantics were preserved

## Non-claims
- This does **not** prove data-action save/apply.
- This does **not** claim a universal internal SAC mutation client.
