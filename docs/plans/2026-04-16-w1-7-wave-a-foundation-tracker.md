# SAC CLI W1.7 Wave A — Foundation Tracker

## Purpose
Ship the smallest honest W1.7 slice: freeze capture + registry shapes around the already-proven `dataaction.validate` lane, without widening the CLI/product spine.

## Parent-grounded baseline
- Branch: `main`
- Baseline verification already green:
  - `npm run test`
  - `npm run test:contract`
  - `npm run typecheck`
  - `npm run build`
  - live `npm run cli -- --json --profile decisioninc-live formula validate --root .`
- Dirty worktree exists before this wave:
  - `M README.md`
  - `M docs/plans/2026-04-16-w1-6-read-only-seam-spine.md`
  - `?? .cgcignore`
  - `?? docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md`
  - `?? docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md`

## Wave A objective
Create typed capture/registry foundations and seed them with `dataaction.validate` truth.

## In scope
### New files
- `src/capture/types.ts`
- `src/registry/schema.ts`
- `src/registry/capability-registry.ts`
- `tests/capture/workflow-capture.spec.ts`
- `tests/registry/capability-registry.spec.ts`
- `fixtures/redacted/dataaction.validate/capture.json`
- `fixtures/redacted/dataaction.validate/registry-entry.yaml`
- `fixtures/redacted/dataaction.validate/README.md`
- `docs/capabilities/README.md`
- `docs/capabilities/dataaction.validate.md`

### Allowed modifications
- `src/formula/validate.ts` only if needed to expose registry-aligned metadata without widening command claims
- `tests/formula/validate.spec.ts` only if needed for that narrow metadata alignment

## Out of scope
- `src/cmd/**`
- `src/data-action/**`
- `src/pilot/**`
- `src/replay/**`
- `src/capture/workflow-capture.ts`
- `src/session/browser-session.ts`
- story/contentlib capability implementation
- any new live tenant mutation flow
- README churn unless strictly required by the landed slice

## Truth rules
- Capability names are semantic (`dataaction.validate`), not endpoint-shaped.
- Capture/registry files must preserve that exact-capture + surgical-patch is the honest baseline.
- No claim that story copy/save is productized in code unless code + fixtures + tests land.
- Keep browser as a first-class proof lane; do not invent a fake universal SAC client.

## TDD order
1. Red tests for capture schema + negative cases
2. Red tests for registry schema/loader + negative cases
3. Implement schema/types/loader
4. Add redacted `dataaction.validate` seed artifacts
5. Run targeted tests
6. Run root verification again

## Verification commands
```bash
npm run test -- tests/capture/workflow-capture.spec.ts tests/registry/capability-registry.spec.ts
npm run test
npm run test:contract
npm run typecheck
npm run build
```

## Parent verdict log
- 2026-04-16: tracker created.
- 2026-04-16: Wave A foundation landed for `dataaction.validate` seed artifacts, schemas, and registry loader; parent verification green.
