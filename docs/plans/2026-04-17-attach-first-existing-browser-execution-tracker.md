# Attach-First Existing Browser — Execution Tracker

Date: 2026-04-17
Canonical plan: `docs/plans/2026-04-17-attach-first-existing-browser-implementation-plan.md`

## Repo state at dispatch
- Branch: `main`
- Repo is dirty in multiple unrelated lanes; parent will scope verification to the attach-first browser/session slice.
- CGC grounding:
  - `configureStoryTableFromPilot` lives in `src/story/configure-table.ts` and is called by the row/column/filter story helpers.
  - `launchPersistentBrowserSession` lives in `src/session/browser-session.ts`; direct callers are hidden behind `createSessionFactory`, so attach-aware acquisition must preserve story helper behavior.

## File fence for this wave
Primary files:
- `src/session/browser-session.ts`
- `tests/session/browser-session.spec.ts`
- `src/config/schema.ts`
- `src/config/profile-store.ts`
- `src/cmd/story.ts`
- `tests/cmd/story.spec.ts`
- `src/story/configure-table.ts`
- `tests/story/configure-table.spec.ts` (only if needed)

## Scope rules
- No SAC creds in repo files.
- No `contentlib.updateContent` archaeology.
- No broad browser-management redesign.
- Keep CLI surface story-only.
- In `attach-only`, never silently launch a fresh persistent browser.

## Proof lanes
Per-task targeted tests:
- `npm run test -- tests/session/browser-session.spec.ts`
- `npm run test -- tests/cmd/story.spec.ts`
- `npm run test -- tests/story/configure-table.spec.ts`

Combined narrow proof:
- `npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts`

Broader sanity:
- `npm run build`

Live smoke target:
- `npm run cli -- --json --profile decisioninc-live story table configure --root . --attach-mode attach-only --browser-debug-url http://127.0.0.1:9333`

## Wave verdict log
- PASS: Task 1 session attach contract
- PASS: Task 2 CLI/profile attach plumbing
- PASS: Task 3 attach-aware story acquisition
- PASS: Task 4 attach-specific error hardening
- PARTIAL PASS: Parent integration/build/live smoke
  - Targeted proof: `npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts` ✅ (42 tests)
  - Build: `npm run build` ✅
  - Live debug port used: `http://127.0.0.1:9222`
  - Live command: `npm run cli -- --json --profile decisioninc-live story table configure --root . --attach-mode attach-only --browser-debug-url http://127.0.0.1:9222`
  - Result: command exited cleanly with `INTERACTIVE_LOGIN_REQUIRED`
  - Browser evidence: tab count was `1` before and `1` after the smoke, so the fresh attached page was cleaned up without leaving a stray tab open
  - Honest verdict: attach-only transport is working, but the available debug browser on `9222` was not authenticated into SAC, so the full 'existing authenticated browser' proof is still pending browser state rather than code wiring
