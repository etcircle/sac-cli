# Roscoe Brief — SAC CLI same-session automation on macOS

## What this is
A narrow external-review brief for `sac-cli`.

The question is **not** about headless widgets, browser harnesses, or broad SAC architecture.
It is specifically about:

1. reusing the **existing authenticated Chrome session/process** on macOS
2. avoiding any fresh Chrome session/context churn
3. proving/automating SAC table/member-selector flows from the CLI
4. dealing with local macOS/Chrome automation restrictions cleanly

## Current repo/work context
Project:
- `~/dev-workspaces/sac-cli`

Relevant files:
- `src/story/configure-table.ts`
- `tests/story/configure-table.spec.ts`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`
- `docs/handoffs/2026-04-17-table-widget-functionality-map.md`
- `tmp/live-proof-existing-session/RESULTS.md`

## What is already solved

### 1. Repo-side logic fix
We implemented a generic member-selector helper in:
- `src/story/configure-table.ts`

It now:
- treats the SAC filter popup as a generic member-selector component
- matches rows by embedded text like `ID: public.Forecast Display Name: Forecast`
- targets the nested SAP checkbox button, not just loose label text
- verifies `Selected Members` contains the target before pressing `OK`

Covered by:
- `tests/story/configure-table.spec.ts`

### 2. Live product truth
Live UI proof exists that the selected target table was successfully set to:
- `Version (1)`
- `Forecast`

That proof was obtained manually in the already-open story and then confirmed with persisted backend evidence.

### 3. Existing session reuse
We proved the existing running Chrome process was authenticated:
- SAC Home opened in a new tab inside the same process
- target story route opened in another tab inside the same process
- no new Chrome session/context was created

### 4. Existing-session authenticated API proof
Using Chrome-derived cookies + CSRF token from the existing session, authenticated SAC API calls worked:
- `epm/session?action=logon`
- `epm/session`
- `contentlib.getContent`

## What is still failing

### A. Local UI automation on macOS
From this environment:
- Chrome still reports `Executing JavaScript through AppleScript is turned off`
- macOS assistive access / keystroke scripting is unavailable
- CDP attach via `127.0.0.1:9222` was not reachable despite Chrome being launched with `--remote-debugging-port=9222`

So the blocker is not SAC auth anymore. It is local browser automation access to the already-running Chrome process.

### B. Out-of-band story mutation via contentlib
We tried patching the target story through authenticated `contentlib.updateContent` using the existing session state.

Observed server-side rejection:
- `INCONSISTENT_VERSION`
- `Story has been updated by another user, please refresh to get the latest version and try making your change again.`

Even when using:
- current authenticated cookies
- fresh CSRF token
- `startEdit`
- browser-captured `updateContent` payload shapes
- current live `getContent` output as the mutation base

So naïve or semi-captured out-of-band mutation is still not accepted by the live editor contract.

## Key evidence already gathered

### Live selected-table proof
Selected table builder state shows:
- `Rows = Reporting Account`
- `Columns = Measures, Version`
- `Filters -> Version (1) = Forecast`

### Persisted backend shift after manual save
`contentlib.getContent` content counts moved from:
- before: `public.Actual = 32`, `public.Forecast = 0`
- after manual save: `public.Actual = 24`, `public.Forecast = 8`

So the target table/filter state really changed and persisted.

## The actual question for Roscoe
What is the best **CLI-friendly** way to finish autonomous same-session SAC automation on macOS **without** creating new browser sessions?

Please focus on these exact subquestions:

### 1. Existing-Chrome-process control
What is the most robust way to control an already-running Chrome process on macOS when:
- Apple Events JS may be flaky/off
- Accessibility/keystroke permissions may be restricted
- remote debugging port appears unreachable even though Chrome was launched with `--remote-debugging-port=9222`

Need practical options for a CLI tool, not generic theory.

### 2. Same-session browser attachment
What are the best options to attach Playwright/Puppeteer/CDP to an already-running local Chrome process **without** launching a new persistent context?

In particular:
- how to verify where Chrome actually exposed its DevTools endpoint on macOS
- whether there are profile- or socket-based attach strategies beyond plain `localhost:9222`
- whether Chrome app mode/fullscreen/profile state can interfere with devtools endpoint visibility

### 3. SAC editor version contract
Given `contentlib.updateContent` is failing with `INCONSISTENT_VERSION`, what is the narrowest honest approach?

Possible directions to assess:
- is there a missing version/edit token outside the visible payload?
- does SAC require an editor/session-local lock or nonce tied to the live page runtime?
- is UI driving the only honest route for this mutation lane unless we can capture a strictly fresher editor-generated save payload from the same open story state?

### 4. Recommended next implementation lane
Given the above, what should `sac-cli` do next?

Strong candidates:
- double down on same-process browser automation attach
- treat contentlib mutation as non-viable for this lane until a stronger capture exists
- add an explicit “existing authenticated browser required” attach mode for story commands
- separate read/proof lanes from mutation lanes more aggressively

## Constraints / non-goals
Do **not** suggest:
- headless widget/browser harness redesign
- broad SAC product re-architecture
- creating fresh browser sessions for convenience
- storing credentials in repo files
- asking the user for creds again

This is specifically about:
- `sac-cli`
- same-session Chrome reuse
- live SAC authoring on the existing authenticated browser process

## Desired output from Roscoe
Please return:
1. the most likely root cause(s) of the local automation blockage
2. the best attach/control strategies ranked by practicality
3. whether `contentlib.updateContent` is worth pursuing for this table-filter lane
4. the recommended next code/architecture move for `sac-cli`
5. any exact macOS/Chrome checks or commands we should run next
