# SAC CLI W1.7 Wave B — Replay/Diff Tracker

## Purpose
Ship the narrowest honest Task 3A slice: replay/diff tooling for the already-proven `dataaction.validate` seam, without widening into generic transport abstractions or new live mutation flows.

## Parent-grounded baseline
- Wave A landed and verified.
- Current baseline still green before Wave B implementation:
  - `npm run test`
  - `npm run test:contract`
  - `npm run typecheck`
  - `npm run build`
- Current proven delicate seam remains `dataaction.validate` in `src/formula/validate.ts`.

## Wave B objective
Extract the one-field patch truth and make payload deltas explicit:
- shared seam-specific patcher
- structured JSON diff summary
- tests proving exact capture + surgical patch is honest and synthetic payload reduction is not equivalent

## In scope
### New files
- `src/replay/diff.ts`
- `src/replay/payload-patchers.ts`
- `tests/replay/diff.spec.ts`

### Allowed modifications
- `src/formula/validate.ts` only to replace the local payload patch helper with an import from `src/replay/payload-patchers.ts`
- `tests/formula/validate.spec.ts` only if a narrow refactor demands it

## Explicitly out of scope
- `src/cmd/**`
- `src/session/**`
- `src/pilot/**`
- `src/registry/**`
- `src/capture/**`
- `src/replay/request-replay.ts`
- story/contentlib capability work
- any live SAC object mutation/copy/save flow
- README churn unless strictly required

## Truth rules
- Keep the unit of truth semantic: `dataaction.validate`, not endpoint worship.
- Diff paths are rooted at the capture envelope (`$.request.body...`, `$.capturedAt`, etc.), not ad hoc mixed roots.
- Treat exact capture + surgical patch as the honest baseline.
- Use the old minimal `objectmgr.validate` request fixture as a negative case showing why synthetic reduction is unreliable.

## TDD order
1. Red test: patched captured payload preserves sibling steps, parameters, and surrounding flags.
2. Red test: captured-vs-patched diff reports exactly one declared patch path and no stable regressions.
3. Red test: captured-vs-synthetic diff reports stable regressions / unexpected removals.
4. Implement `src/replay/payload-patchers.ts`.
5. Implement `src/replay/diff.ts`.
6. Refactor `src/formula/validate.ts` to use the shared patcher.
7. Run targeted tests, then root verification.

## Verification commands
```bash
npm run test -- tests/replay/diff.spec.ts tests/formula/validate.spec.ts
npm run test
npm run test:contract
npm run typecheck
npm run build
```

## Parent verdict log
- 2026-04-16: tracker created.
- 2026-04-17: Wave B landed for `dataaction.validate` replay/diff tooling; parent verification green.
- 2026-04-17: Follow-up honesty hardening landed: `runtimeMode` now reports captured replay vs fallback, and `readSacRuntimeContext()` retries through transient SAML navigation context resets.
