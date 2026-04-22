# SAC Table Widget API Harvest Plan

> Goal: turn the SAP Help PDF into a concrete, stepwise harvest program for the planning table widget, then execute it against the live `decisioninc-live` tenant in one managed browser session.

## Why this plan exists

The user asked for the **different APIs behind the table widget**, not another narrow `Version -> Forecast` bug diary.

The PDF gives the honest product surface. The current repo gives us:
- a real story/table driver: `src/story/configure-table.ts`
- a real capture schema: `src/capture/types.ts`
- a real capture helper: `src/capture/workflow-capture.ts`
- **no actual story-table capture integration yet**

So the right move is:
1. use the PDF as the step inventory,
2. use the existing story driver where it already works,
3. wrap the live Playwright page with request/response logging,
4. write a harvest artifact per step instead of pretending one `story table configure` run magically proves all seams.

## Ground truth from the PDF

Source: `/Users/felixcardix/Downloads/sac-table-widget-functionality.pdf`

Confirmed page anchors:
- **Page 3** — drag `Table`, choose `Select other model...`, builder opens, planning tables support `Cross-Tab` and `Forecast Layout`
- **Page 6** — builder/table properties include `Cross-Tab`, `Forecast Layout`, `Adaptive Column Width`, row/column dimension edits, filter entrypoints
- **Page 20** — `Edit Scripts...` exists for the table widget when `Advanced Mode` is enabled
- **Page 87** — quick actions include `Open Quick Builder`, `Edit Scripts...`, `Copy`, `Edit Styling`, `Open Data Analyzer...`

## Existing live context

Profile: `decisioninc-live`

Saved browser profile:
- `/Users/felixcardix/.local/share/sac-cli/profiles/decisioninc-live/browser`

Target story route from pilot bundle:
- `#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit`

Canonical story/table driver:
- `configureStoryTableFromPilot()` in `src/story/configure-table.ts`

Important repo truth:
- `configureStoryTableFromPilot()` is the only real workflow driver for story-table setup right now.
- `captureWorkflow()` has **no callers** yet, so the story lane is not actually producing structured captures.

## Harvest output contract

All artifacts for this run should land under a timestamped folder, for example:
- `tmp/table-widget-api-harvest/<timestamp>/`

Per step keep:
- `step.json` — structured summary for the step
- `requests.json` — all interesting matched requests/responses for that step
- `screenshot.png` — UI evidence
- `dom.txt` or `menu.json` when the visible surface matters more than the network

Interesting network families:
- `/sap/fpa/services/rest/`
- `/sap/bc/ina/service/v2/`
- `/sap/fpa/services/rest/v1/internal/`

Deprioritize noise:
- telemetry
- perf logs
- fonts/assets/bundles
- sentry
- notifications

## Step inventory derived from the PDF

### Phase 1 — baseline authoring flow

#### Step 1. Story route load / builder hydration
- Action: open the dedicated responsive story route
- Expected: story loads in edit mode with table lane reachable
- Harvest target: route-load requests that hydrate the story and builder state
- Likely classifications: repository/content, story metadata, builder/runtime state

#### Step 2. Table insert
- Action: insert the `Table` widget if it is not already present
- Expected: table placeholder / ghost table appears
- Harvest target: table-insert mutation and any follow-up hydration requests

#### Step 3. Model bind
- Action: `Select other model...` → `C_REPORTING_CLI_TESTING`
- Expected: builder switches to planning-table mode
- Harvest target: model-selection and post-bind hydration requests

#### Step 4. Variable application
- Action: set `202004`, `202003`, `2020`, `2019`
- Expected: table hydrates into builder-ready state
- Harvest target: variable-application and post-variable refresh requests

### Phase 2 — builder structure

#### Step 5. Table type surface
- Action: inspect/switch `Cross-Tab` and `Forecast Layout`
- Expected: visible table-type property surface exists, ideally mutable
- Harvest target: table-layout/property mutation requests

#### Step 6. Row dimension flow
- Action: open row dimension picker / add a row dimension
- Expected: dimension chooser surface opens for rows
- Harvest target: dimension list / metadata / mutation requests

#### Step 7. Column dimension flow
- Action: open column dimension picker / add a column dimension
- Expected: dimension chooser surface opens for columns
- Harvest target: dimension list / metadata / mutation requests

#### Step 8. Filter flow
- Action: open `Version` filter and reach the generic member-selector dialog
- Expected: `Available Members` / `Selected Members` dialog visible
- Harvest target: filter picker and member-selection requests
- Note: this is the currently known blocker for the fully automated lane, so capture is still valuable even if selection fails.

### Phase 3 — advanced mode / quick actions

#### Step 9. More actions menu inventory
- Action: open the table widget’s more-actions menu
- Expected: enumerate `Open Quick Builder`, `Edit Scripts...`, `Copy`, `Edit Styling`, `Open Data Analyzer...` if present
- Harvest target: menu-open request if any, plus visible-menu proof

#### Step 10. Open Quick Builder
- Action: open it if visible
- Expected: simplified builder surface appears
- Harvest target: quick-builder metadata/layout requests

#### Step 11. Edit Scripts
- Action: open it if visible
- Expected: scripting/editor surface appears
- Harvest target: scripting metadata/editor bootstrap requests

#### Step 12. Edit Styling
- Action: open widget styling surface
- Expected: widget-specific styling panel visible
- Harvest target: styling-panel bootstrap or property fetch requests

#### Step 13. Open Data Analyzer
- Action: open only if it stays in safe sandbox browsing
- Expected: analyzer launch route/surface is visible
- Harvest target: analyzer launch requests

### Phase 4 — persistence proof

#### Step 14. Save after a safe widget change
- Action: save a checkpoint after one harmless builder/style mutation
- Expected: save succeeds without re-login churn
- Harvest target: repository/content save requests

## Execution approach

### A. Use the existing workflow driver as the base lane
Use `configureStoryTableFromPilot()` to drive:
- route open
- optional insert
- model bind
- variable fill
- rows/columns
- filter attempt

But do **not** trust it as the capture layer. Wrap the Playwright page with response logging.

### B. Keep one browser session
- one persistent Chrome context
- one page
- one story route
- no tmp probe churn across separate browser lifecycles during the main harvest

### C. Log every interesting request/response during each named step
For each step bucket, record:
- method
- normalized URL
- request body
- response status
- response body snippet / JSON when available
- inferred action name if the payload contains `action`, `function`, `command`, etc.

### D. Classify distinct API seams after capture
For each step, classify into buckets such as:
- `contentlib`
- `objectmgr`
- `ina`
- `internal-rest`
- `other-sac-rest`
- `noise`

## Files involved

Read / reuse:
- `src/story/configure-table.ts`
- `src/capture/workflow-capture.ts`
- `src/capture/types.ts`
- `src/session/browser-session.ts`
- `pilot/proof-inputs.yaml`
- `docs/plans/2026-04-17-sac-table-widget-perfection-checklist.md`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`

Execution scratch:
- `tmp/table-widget-api-harvest.ts`

Artifacts:
- `tmp/table-widget-api-harvest/<timestamp>/...`

## Success criteria for this run

Minimum honest success:
- the plan exists in-repo
- a harvest runner exists
- the runner executes against the live tenant/profile
- baseline story/table steps are captured with distinct request families
- the quick-actions surface is inventoried from the live UI
- the output explicitly says which PDF-derived surfaces were captured, blocked, or not visible

Stretch success:
- quick builder and edit scripts are opened and captured cleanly
- at least one save/persist seam is captured after a table-widget change

## Blunt caveat

We probably won’t get *every* PDF surface cleanly in one pass. That’s fine.
What is not fine is pretending a flaky partial run equals “all APIs captured”.

If a step blocks, record the blocker and keep the already captured seams.
