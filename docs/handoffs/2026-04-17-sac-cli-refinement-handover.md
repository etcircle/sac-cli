# SAC CLI Handover — 2026-04-17 — Refinement Continuation

## Timestamp
- Generated: 2026-04-17 11:04:28 BST
- Branch: `main`

## Goal for next session
Continue **the CLI smoke matrix and story/table refinement**, not an old single-bug chase.

Immediate focus:
1. keep the session/auth hardening intact
2. start with the live smoke matrix in this order:
   - `auth status`
   - `data-action get`
   - `formula validate`
   - `formula verify-pilot`
   - `story table configure`
   - `story table add-row-dimension`
   - `story table add-column-dimension`
   - `story table set-filter`
3. keep every story/table workflow inside one managed SAC session/tab per command — no tmp probe-session churn
4. after the matrix, continue the capability-scaling lane

## What landed in this session

### 1) Session hardening for live SAC routes
A new route-opening helper was added so live commands stop doing dumb full-page SAC churn when the app shell is already open.

Primary change:
- `src/session/browser-session.ts`

What it does:
- adds `openSacRoute()`
- detects whether we are already inside the SAC app shell
- reuses **hash navigation** when possible instead of hard `page.goto(...)`
- fails clearly with interactive-login-required if the saved profile has fallen back to SAML/login

Supporting helpers added there:
- `isSacAppUrl()`
- `isLikelySacLoginUrl()`

### 2) Live consumers switched to use the new route helper
Changed:
- `src/data-action/read.ts`
- `src/formula/validate.ts`
- `src/formula/verify-pilot.ts`

Meaning:
- these flows now try to stay inside one SAC shell/session instead of forcing fresh route churn

### 3) Validation flow already improved before/alongside this work
`src/formula/validate.ts` currently:
- uses replay of the captured validate payload when available
- exposes `runtimeMode`
  - `captured-request-replay`
  - `single-step-fallback`

This is important because the live proof currently uses the honest captured-request path.

### 4) Tests updated
Changed tests:
- `tests/session/browser-session.spec.ts`
- `tests/data-action/read.spec.ts`
- `tests/formula/validate.spec.ts`

The test updates mainly reflect:
- route reuse instead of mandatory hard `goto`
- explicit session/login detection behavior
- `runtimeMode` assertions for formula validation

## Verified in this session

### Repo verification
These passed:
- `npm run test`
- `npm run build`

At the point of handoff, repo tests were green:
- 19 test files passed
- 92 tests passed

### Live verification on the real tenant/profile
Profile:
- `decisioninc-live`

Tenant:
- `https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html`

These live commands passed:

#### 1. Auth status
```bash
npm run cli -- --enable-commands auth --json --profile decisioninc-live auth status
```
Result:
- `status = ok`
- `currentUrl = https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html`

#### 2. Data action read
```bash
npm run cli -- --json --profile decisioninc-live data-action get --root .
```
Result:
- passed live
- returned real live metadata for `C_REP_DA008`
- no auth-loop churn observed

#### 3. Formula validate
```bash
npm run cli -- --json --profile decisioninc-live formula validate --root .
```
Result:
- passed live
- `runtimeMode = captured-request-replay`
- returned the real semantic error:
  - `UPDATED_OTHER_MODEL: C_RATES`

## What is still broken

### Story/table lane is now the real blocker

#### What is green live now
```bash
npm run cli -- --enable-commands auth --json --profile decisioninc-live auth status
npm run cli -- --json --profile decisioninc-live data-action get --root .
npm run cli -- --json --profile decisioninc-live formula validate --root .
npm run cli -- --json --profile decisioninc-live formula verify-pilot --root .
```

Current truth:
- `auth status` = good
- `data-action get` = good
- `formula validate` = good
- `formula verify-pilot` = good again (`readback-stable`, repeatability stable)

#### Current live story failure
```bash
npm run cli -- --json --profile decisioninc-live story table configure --root .
```

Current live failure state:
- the default pilot story route now points at the dedicated responsive `Hermes CLI table perfection 2026-04-17-08-44` story in `My Files / My Playground / CLI-Testing`
- variable prompts are now being filled inside the same managed story session
- the command reaches the `Set Filters for Version` dialog
- the remaining blocker is selecting `Forecast` cleanly and replacing `Actual`
- latest live error:
  - `STORY_TABLE_FILTER_VALUE_NOT_FOUND`

Important interpretation:
- this is no longer the stale-pilot-route problem
- this is no longer the `formula verify-pilot` problem
- the active blocker is the filter-selection automation inside the Version filter dialog on the responsive story/table lane

## The likely culprit
`src/story/configure-table.ts`

The story/table lane was using stale pilot story metadata and brittle modal handling.

What is improved now:
- pilot story metadata points at the dedicated responsive `CLI-Testing` story
- failure diagnostics now write `failure.png`, `failure-body.txt`, and `failure-url.txt`
- variable prompts are filled against the real responsive-story modal instead of old generated ids

What is still not honest/proven:
- the Version filter dialog selection path is still brittle
- current automation reaches the dialog but does not yet land `Forecast` as the selected member

So the next session should treat this as a **live filter-dialog interaction bug** in the story/table lane, not as a formula/editor problem.

## Current best guess for the next fix
Do **not** keep blindly poking SAC.

Work locally first on `src/story/configure-table.ts`:
1. keep the dedicated responsive story route in the pilot bundle
2. keep all story/table actions inside one managed session/page
3. instrument or inspect the `Set Filters for Version` dialog specifically
4. make the selection path target the real interactive member control for `Forecast`, not just visible text
5. only then rerun the live `story table configure` smoke, followed by:
   - `story table add-row-dimension`
   - `story table add-column-dimension`
   - `story table set-filter`

Bluntly: the remaining pain is the filter dialog, not the rest of the smoke matrix.

## Recommended next-session start order

### Step 1 — re-read context
Read:
- `README.md`
- `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md`
- `docs/plans/2026-04-17-w1-7-wave-d-api-expansion-plan.md`
- `docs/handoffs/2026-04-17-sac-cli-refinement-handover.md`

### Step 2 — verify baseline fast
Run:
```bash
git status --short
npm run test
npm run build
npm run cli -- --enable-commands auth --json --profile decisioninc-live auth status
npm run cli -- --json --profile decisioninc-live data-action get --root .
npm run cli -- --json --profile decisioninc-live formula validate --root .
npm run cli -- --json --profile decisioninc-live formula verify-pilot --root .
npm run cli -- --json --profile decisioninc-live story table configure --root .
```

### Step 3 — fix the live story/table blocker
Focus on the filter dialog inside the same managed story session:
```bash
npm run cli -- --json --profile decisioninc-live story table configure --root .
```

Goal:
- get a **real live** successful `story table configure` run on the dedicated responsive story
- then continue the generic command matrix with:
  - `story table add-row-dimension`
  - `story table add-column-dimension`
  - `story table set-filter`

### Step 4 — only after that, continue capability scaling
Then resume the Wave D capture/promotion lane with the command matrix proven first.

## Files most relevant to this handoff

### Changed this session
- `src/session/browser-session.ts`
- `src/data-action/read.ts`
- `src/formula/validate.ts`
- `src/formula/verify-pilot.ts`
- `tests/session/browser-session.spec.ts`
- `tests/data-action/read.spec.ts`
- `tests/formula/validate.spec.ts`

### Planning / continuity docs
- `docs/plans/2026-04-17-w1-7-wave-d-api-expansion-plan.md`
- `docs/plans/2026-04-17-sac-table-widget-perfection-checklist.md`
- `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md`
- `docs/handoffs/2026-04-17-sac-cli-refinement-handover.md`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`

## Repo state note
The repo is still **dirty** beyond just this session’s edits because earlier Wave A/B/C/D work and docs are not all committed yet.

At handoff time, `git status --short` included modified/untracked work across:
- docs
- capture/registry/replay areas
- formula/session/data-action code
- tests

So: **do not start from a fantasy clean-tree assumption**.

## Blunt summary
- session/auth hardening: **real and still verified**
- `data-action get`: **good**
- `formula validate`: **good**
- `formula verify-pilot`: **good again**
- default pilot story metadata now points at the dedicated responsive `CLI-Testing` story
- story variable prompts are handled inside the same managed story session
- `story table configure`: **still blocked live** on selecting `Forecast` in the Version filter dialog
- next session should keep the smoke-matrix order, then finish the filter dialog and continue the generic story/table command lane

## Suggested opener for the next session
Use this:

> Continue the SAC CLI refinement from `docs/handoffs/2026-04-17-sac-cli-refinement-handover.md`. Start with the live smoke matrix (`auth status`, `data-action get`, `formula validate`, `formula verify-pilot`, `story table configure`). Keep the story/table lane inside one managed SAC session/tab per command, avoid tmp probe churn, and fix the live `story table configure` blocker in `src/story/configure-table.ts` so the Version filter lands `Forecast` instead of `Actual`. Then continue `story table add-row-dimension`, `story table add-column-dimension`, and `story table set-filter`.
