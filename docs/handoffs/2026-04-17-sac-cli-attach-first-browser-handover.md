# SAC CLI Handover — 2026-04-17 — Attach-First Existing Browser Continuation

## Timestamp
- Generated: 2026-04-17 22:47:29 BST
- Branch: `main`

## Goal for next session
Do **not** reopen `contentlib.updateContent` archaeology.
Continue from the now-working **attach-first existing browser** lane and prove it against a browser that is **already authenticated into SAC**.

Bluntly:
- the attach transport is now real
- the CLI no longer hangs in `attach-only`
- the remaining blocker is **browser state**, not attach wiring

## Canonical docs to read first
1. `docs/plans/2026-04-17-attach-first-existing-browser-implementation-plan.md`
2. `docs/plans/2026-04-17-attach-first-existing-browser-execution-tracker.md`
3. `docs/handoffs/2026-04-17-sac-cli-attach-first-browser-handover.md`

## What landed in this session

### 1) Browser session layer now supports attach-first acquisition
Primary file:
- `src/session/browser-session.ts`

What now exists:
- `attachToBrowserSession(...)`
- `openManagedBrowserSession(...)`
- explicit attach modes:
  - `launch`
  - `attach-first`
  - `attach-only`
- attach-specific error codes/messages:
  - `BROWSER_ATTACH_REQUIRED`
  - `BROWSER_ATTACH_UNAVAILABLE`
  - `BROWSER_ATTACH_FAILED`
  - `BROWSER_ATTACH_CONTEXT_MISSING`
  - `BROWSER_ATTACH_PAGE_FAILED`

Important behavior:
- `launch` preserves the old headed persistent-context path
- `attach-only` never launches a fresh browser
- `attach-first` only falls back to launch for transport-level attach failures
- attached-session teardown now:
  - closes the owned fresh page
  - does **not** close the shared context
  - **does** disconnect the CDP browser client so the CLI exits cleanly

### 2) Story CLI surface now accepts attach controls
Primary files:
- `src/config/schema.ts`
- `src/cmd/story.ts`

What changed:
- profiles now support optional:
  - `remoteDebuggingUrl`
  - `browserAttachMode`
- story commands now support:
  - `--browser-debug-url <url>`
  - `--attach-mode <launch|attach-first|attach-only>`
- these options are validated and forwarded through the story command contract

### 3) Story/table acquisition is now attach-aware
Primary file:
- `src/story/configure-table.ts`

What changed:
- `ConfigureStoryTableInput` now carries:
  - `browserDebugUrl`
  - `attachMode`
- `configureStoryTableFromPilot()` now acquires sessions through the attach-aware path instead of the old launch-only session factory
- session cleanup now still runs if page adaptation fails early

### 4) Failure diagnostics were hardened
Primary file:
- `src/story/configure-table.ts`

Important fix:
- `captureFailureDiagnostics()` is now best-effort
- a failing diagnostics `page.evaluate(...)` no longer masks the original story error
- screenshot/body/url writes are still attempted even if dialog-HTML capture fails

## Test coverage added/updated
Primary test files:
- `tests/session/browser-session.spec.ts`
- `tests/cmd/story.spec.ts`
- `tests/story/configure-table.spec.ts`

What is now covered:
- attach session contract
- page-only ownership for attached sessions
- attach-only clear failures
- attach-first fallback boundaries
- CLI/story attach option forwarding
- story session cleanup on non-interactive page
- diagnostics capture after attach succeeds and story logic fails
- diagnostics HTML-capture failure not masking original error

## Parent verification completed in this session

### Targeted proof
Passed:
```bash
npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts
```

Final targeted result:
- 3 test files passed
- 42 tests passed

### Build proof
Passed:
```bash
npm run build
```

## Live smoke that was run
Command used:
```bash
npm run cli -- --json --profile decisioninc-live story table configure \
  --root . \
  --attach-mode attach-only \
  --browser-debug-url http://127.0.0.1:9222
```

Final live result:
- process exited cleanly
- returned:
  - `INTERACTIVE_LOGIN_REQUIRED`
- this is now an **honest** result

What that proves:
- attach-only transport works
- the command can connect through CDP and proceed into the story lane
- the CLI no longer hangs after attach
- attached-tab cleanup works

What it does **not** prove yet:
- that the reused browser is SAC-authenticated
- that the full story/table workflow can complete in an already-authenticated SAC browser

## Browser state observed during live proof
Current debug browser used for the final smoke:
- `http://127.0.0.1:9222`

Observed tab state at handoff time:
- tab count: `1`
- current tab URL:
  - `http://localhost:8080/knowledge-hub?scope=client&client_id=40&tab=graph`

Interpretation:
- this debug browser is **not** sitting in SAC
- so `INTERACTIVE_LOGIN_REQUIRED` is expected and not a code-regression signal

Also important:
- the older cloned debug browser on `9333` is no longer the active proof target
- next session should either:
  1. relaunch a dedicated SAC-authenticated debug Chrome on `9333`, or
  2. intentionally use another live debug port that is already authenticated into SAC

## Current repo state
Repo is dirty and **not committed**.
Relevant status at handoff:
```bash
M src/config/schema.ts
M src/session/browser-session.ts
M tests/session/browser-session.spec.ts
?? docs/plans/2026-04-17-attach-first-existing-browser-execution-tracker.md
?? src/cmd/story.ts
?? src/story/configure-table.ts
?? tests/cmd/story.spec.ts
?? tests/story/configure-table.spec.ts
```

Do not lose sight of that.
Next session should treat these exact files as the active slice.

## Files that matter most
- `src/config/schema.ts`
- `src/cmd/story.ts`
- `src/story/configure-table.ts`
- `src/session/browser-session.ts`
- `tests/cmd/story.spec.ts`
- `tests/story/configure-table.spec.ts`
- `tests/session/browser-session.spec.ts`
- `docs/plans/2026-04-17-attach-first-existing-browser-execution-tracker.md`

## Recommended next-session start order

### Step 1 — re-ground quickly
Read:
- `README.md`
- `docs/plans/2026-04-17-attach-first-existing-browser-implementation-plan.md`
- `docs/plans/2026-04-17-attach-first-existing-browser-execution-tracker.md`
- `docs/handoffs/2026-04-17-sac-cli-attach-first-browser-handover.md`

### Step 2 — verify local baseline
Run:
```bash
git status --short
npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts
npm run build
```

### Step 3 — get a real SAC-authenticated debug browser
Do this **before** blaming the code.
Need a browser debug port whose live tab/session is actually in SAC.

Suggested check:
```bash
python3 - <<'PY'
import json, urllib.request
with urllib.request.urlopen('http://127.0.0.1:9222/json/list', timeout=5) as r:
    tabs=json.load(r)
print('TAB_COUNT', len(tabs))
for t in tabs:
    print(t.get('url',''))
PY
```

If it is not showing SAC routes, fix browser state first.

### Step 4 — rerun the live attach-only proof against the authenticated debug browser
Example shape:
```bash
npm run cli -- --json --profile decisioninc-live story table configure \
  --root . \
  --attach-mode attach-only \
  --browser-debug-url http://127.0.0.1:9333
```

Success condition for the next session:
- reuse an already-authenticated browser
- create a fresh attached page
- do not launch a fresh persistent browser
- no `INTERACTIVE_LOGIN_REQUIRED`
- if it still fails, the failure should now be inside real story/table interaction logic

## If the next smoke still fails
Use this decision split:

### If the error is still `INTERACTIVE_LOGIN_REQUIRED`
That is a **browser-state/authentication** problem.
Do not chase attach code.

### If the error is an attach-specific code
That is a **debug-port / CDP** problem.
Do not chase story logic yet.

### If the command gets past auth and fails later in story/table automation
That is the real next product bug.
At that point the attach-first wave did its job.

## Honest verdict at handoff
This wave is effectively complete from a code-wiring perspective.
The missing proof is not "can sac-cli attach to an existing browser?"
It can.

The missing proof is:
- can it do that against a browser that is already authenticated into SAC and then complete the story/table workflow?

That is the next session’s job.
