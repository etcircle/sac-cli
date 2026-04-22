# SAC Member-Selector Live Proof Plan

> **Constraint:** use the existing authenticated Chrome browser session only. No new Chrome session/context churn. New tabs/windows are allowed only inside that same running browser process.

**Goal:** verify the generic member-selector fix live against the existing SAC auth session, prove whether `Version -> Forecast` now works, and capture screenshot evidence at each boundary.

**Current code baseline:**
- `src/story/configure-table.ts` now uses a generic member-selector plan that targets the nested SAP checkbox button and checks `Selected Members` before committing with `OK`.
- targeted repo tests already pass.

---

## Phase 1 — Session discovery / auth truth

1. Inspect the already-running Chrome instance and its active tabs/windows.
2. Confirm whether an SAC tab already exists.
3. If a SAC tab exists, reuse it.
4. If no SAC tab exists, open a **new tab in the same existing Chrome process** to the target story route.
5. Capture a screenshot proving whether the browser is:
   - authenticated SAC app shell, or
   - SAML/login page.

**Success condition:** we have one live SAC tab inside the existing Chrome process and proof of login state.

---

## Phase 2 — Route / story readiness proof

1. Bring the SAC story tab to the foreground.
2. Confirm the route is the responsive story edit lane.
3. Capture screenshot of the story/table state before interaction.
4. If the page is not on the target story route, navigate within the same browser process/tab (or a new tab in same process) to:
   - `#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit`
5. Capture screenshot after route settle.

**Success condition:** live authenticated story edit page is visible.

---

## Phase 3 — Member-selector proof

1. Trigger the existing story-table configure path only through the existing browser session/process.
2. Open the `Version` filter dialog.
3. Capture screenshot of the member-selector before selection.
4. Verify visible presence of:
   - `Forecast`
   - `Selected Members`
   - current selection state.
5. Apply the new generic member-selector logic.
6. Capture screenshot after selection but before/after OK if possible.
7. Verify builder/body text now reflects `Version` + `Forecast` and does not keep `Actual` selected.

**Success condition:** `Version -> Forecast` is visibly committed in the live builder.

---

## Phase 4 — Persistence / checkpoint proof

1. Save a story checkpoint in the same browser session.
2. Capture screenshot after save.
3. Re-check current page/body state in the same browser process.
4. Capture final proof screenshot.

**Success condition:** filter choice remains visible after save checkpoint.

---

## Evidence to keep

Store under a new timestamped proof folder or the existing evidence directory, including at least:
- login-state screenshot
- pre-interaction story screenshot
- member-selector screenshot
- post-selection builder screenshot
- post-save screenshot
- short markdown summary of pass/fail and exact blocker if it still fails

---

## Hard rules

- Do **not** launch a fresh Chrome persistent context.
- Do **not** run a temp probe that opens/closes its own browser lifecycle.
- Do **not** ask for credentials again.
- If the existing browser process is no longer authenticated, stop and report that exact blocker instead of creating session churn.
