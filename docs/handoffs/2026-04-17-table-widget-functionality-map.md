# SAC Table Widget Functionality Map — 2026-04-17

> Follow-up canonical matrix: `docs/handoffs/2026-04-17-table-widget-pdf-sac-capability-matrix.md`
>
> This original file stays useful as the harvest-backed live snapshot. The new matrix is the broader PDF → live SAC → sac-cli coverage map.

## Scope / discipline

This map is built from the already-captured live harvest artifacts under:

- `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/`

Important: after Emiliyan called out the session churn, **no new SAC session/context was launched for this write-up**. This report is synthesized from the existing live run, screenshots, and captured requests only.

## Primary artifacts used

- Run summary:
  - `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/summary.json`
  - `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/SUMMARY.md`
- Baseline request capture:
  - `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/01-baseline-configure-driver/requests.json`
- Step evidence:
  - `.../02-member-selector-state/screenshot.png`
  - `.../07-open-edit-scripts/screenshot.png`
  - `.../09-open-edit-styling/screenshot.png`
  - `.../10-open-copy-menu/screenshot.png`

## Baseline API seam inventory

### 1. `contentlib` — story/content repository + edit lifecycle
Proven actions captured during the baseline table route run:

- `getContent`
- `startEdit`
- `getResourcesEx`
- `getSearchList`
- `getResourceEx`
- `updateContent`

Interpretation:
- story load/open state
- repository metadata lookup
- edit-lock / authoring lifecycle
- story save/update persistence lane

### 2. `objectmgr` — object metadata / function seam
Proven actions captured:

- `listObjects`
- `callFunction`

Interpretation:
- object metadata discovery
- function-style authoring / planner helper calls

### 3. `INA GetResponse` — heavy planning/query metadata lane
Dominant request family in the baseline run.

Observed command families include:
- `get_actions`
- `get_parameters`
- `get_query_sources`
- `get_versions`

Observed planning/domain names inside the captured request bodies include:
- `Version`
- `Date`
- `Measures`
- `Actual`
- `C_AUDITTRAIL`
- `C_COMP_CODE`
- `C_REPACC`
- `InputSchedule.Filter`

Interpretation:
- planning metadata
- version/query source discovery
- dimension/measure hydration
- variable/parameter readback

### 4. `internal-rest` — model/version support reads
Captured endpoints:
- `/sap/fpa/services/rest/v1/internal/models/C9dksk0o57hlt1jra87he2vh67/versions?...`
- `/sap/fpa/services/rest/v1/internal/model-actions/backup-all-versions?tenant=J`

Interpretation:
- model version state
- support/admin planning metadata

## Table functionality map

### A. Story route load + table/builder hydration
**Status:** proven live

Evidence:
- baseline run succeeded far enough to hydrate the responsive story, bind into the planning-table lane, and reach the Version filter member-selector blocker
- 61 interesting requests captured in the baseline step

Best seam candidates:
- `contentlib`
- `objectmgr`
- `INA GetResponse`
- internal model/version reads

### B. Variable-driven planning hydration
**Status:** proven live

Evidence:
- baseline configure driver reached the planning table and then failed later on filter member selection, which means route open, model bind, variable fill, and table hydration all happened before the blocker
- captured INA payloads include planning variables/period/year/version-related names

Best seam candidates:
- `INA GetResponse`
- `objectmgr.callFunction`
- supporting `contentlib.updateContent`

### C. Generic filter/member-selector dialog
**Status:** proven live as a reusable SAC component; automation still blocked

Evidence from the live dialog capture:
- dialog id: `__table3-Member-Filter`
- classes include:
  - `member-selector`
  - `report-member-selector`
- visible text:
  - `Set Filters for Version`
  - `Available Members`
  - `Actual`
  - `Budget`
  - `Forecast`
  - `Selected Members`
  - `Actual`
  - `Clear Selection`
  - `OK`
  - `Cancel`
- custom-tree ids were captured under `...-custom-tree`

Conclusion:
- the popup is the generic SAC member-selector shell
- `Forecast` is visibly present
- the blocker is the custom row/checkbox interaction path, not missing data

Best seam candidates:
- mostly browser/UI interaction on top of already-hydrated SAC state
- no clean isolated filter-mutation request captured yet

### D. Builder surface currently visible on the live table
**Status:** proven live

Visible live builder/table properties from the screenshots:
- `Data Source = C_REPORTING`
- `Table Structure`
- `Cross-tab`
- `Adaptive Column Width` (visible/enabled)
- `Arrange Totals / Parent Nodes Below` (visible)
- `Rows`
- `Columns`
- `Filters`
- SAC banner: `Switch All Tables to New Build Experience`

Additional later proof from the selected target table:
- `Rows = Reporting Account`
- `Columns = Measures, Version`
- `Filters` include:
  - `Measures (1)`
  - `Reporting Account (1)`
  - `Version (1) = Forecast`

Interpretation:
- the current widget is in the legacy/current builder surface, not yet switched to the new table build experience
- the target selected table was later proven in the live UI to be in the desired single-version `Forecast` state

### E. Context-menu / more-actions inventory
**Status:** proven live

Visible actions from the live table widget context menu:
- `Applied to Table`
- `Drill`
- `Freeze`
- `Ignore Data Locks`
- `Swap Axis`
- `Resize table to fit content`
- `Mass Data Entry`
- `Distribute Values`
- `Manage Data Locks...`
- `Value Lock Management`
- `Remove Reference` (disabled in the screenshot)
- `Linked Analysis`
- `Add`
- `Show/Hide`
- `Edit Scripts...`
- `Copy`
- `Export`
- `Edit Styling...`
- `Full Screen`
- `Lock in Place`
- `Delete`

Important correction:
- the scratch runner initially misclassified `Edit Styling...` as absent because it looked for `Edit Styling` without the ellipsis
- the screenshot proves `Edit Styling...` **is** present in the live menu

### F. `Edit Scripts...`
**Status:** proven live at submenu-entry level

Visible script-event entries:
- `onSelect`
- `onResultChanged`
- `onAfterDataEntryProcess`

Captured network at submenu-open step:
- only `userFriendlyPerfLog`

Interpretation:
- the scripting entry surface is definitely there
- menu/submenu open itself did not yield a clean authoring API seam
- the next real seam would require opening one of the event editors inside the existing authenticated tab

### G. `Copy`
**Status:** proven live at submenu-entry level

Visible copy submenu entries:
- `Copy`
- `Copy To`
- `Duplicate`

Captured network at submenu-open step:
- none

Interpretation:
- copy/duplicate is exposed as widget UI functionality
- submenu open itself did not yet reveal a clean backend seam

### H. `Edit Styling...`
**Status:** visible live; not yet executed cleanly in the capture run

Evidence:
- present in the live context-menu screenshot
- builder/styling-related properties are visible in the right panel

Interpretation:
- styling surface is definitely part of the current widget functionality map
- a clean `Edit Styling...` open/capture still needs to be done in the **existing** authenticated tab

### I. `Open Quick Builder`
**Status:** not visible in the captured live widget state

Evidence:
- the live context-menu screenshot used for table action mapping does not show it
- the scratch run marked it blocked because the item was not visible

Interpretation:
- either tenant/build/widget-state dependent
- or hidden behind another mode/surface
- PDF says it can exist, but this run did not prove it live

### J. `Open Data Analyzer...`
**Status:** not visible in the captured live widget state

Evidence:
- absent from the captured context-menu screenshot
- scratch run marked it blocked because the item was not visible

Interpretation:
- same story as Quick Builder: PDF says this can exist, but this specific live widget state did not expose it

### K. `Forecast Layout`
**Status:** documented in PDF, not proven visible in this live capture

Evidence:
- PDF says planning tables support `Cross-Tab` and `Forecast Layout`
- current live builder screenshot clearly shows `Cross-tab`
- current captured live state did **not** prove a visible `Forecast Layout` toggle/option on screen

Interpretation:
- likely state-dependent / hidden behind another entry path
- do not claim it as live-proven yet

## Honest classification grid

### Proven live
- story/table route hydration
- planning-table builder hydration
- generic member-selector dialog exists and contains `Forecast`
- builder surface with `Cross-tab`
- `Adaptive Column Width`
- context-menu inventory listed above
- `Edit Scripts...` submenu
- `Copy` submenu
- `Edit Styling...` menu entry

### Visible but not yet fully exercised
- styling surface
- script-event editor beyond submenu level
- save/persist seam after a specific widget action

### Blocked or not yet isolated
- generic member-selector row/checkbox automation for `Version -> Forecast`
- clean downstream API seam for filter commit
- clean downstream API seam for script editor open
- clean downstream API seam for widget copy/duplicate execution

### Not visible in this widget state
- `Open Quick Builder`
- `Open Data Analyzer...`
- `Forecast Layout` toggle/path

## Practical next step (without repeating the same mistake)

When continuing the harvest, do **not** launch a fresh SAC browser context.

Use the already-authenticated existing tab/session and do this in order:
1. finish the generic member-selector helper in `src/story/configure-table.ts`
2. from the same live table widget, reopen the context menu
3. open `Edit Styling...` cleanly and capture any downstream requests
4. open one `Edit Scripts...` event entry and capture that deeper editor bootstrap
5. execute one copy/duplicate action and capture the first real mutation seam

## Repo files now most relevant

- `docs/plans/2026-04-17-table-widget-api-harvest-plan.md`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`
- `docs/handoffs/2026-04-17-table-widget-functionality-map.md`
- `tmp/table-widget-api-harvest.ts`
- `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/`
