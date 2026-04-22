# SAC Table Widget — PDF → SAC Capability Matrix

## Why this exists

The earlier `2026-04-17-table-widget-functionality-map.md` was honest, but it was still harvest-first and incomplete.

This file is the broader canonical map:
- **PDF surface area** = what SAP says the table widget can do
- **Decision Inc live truth** = what we have actually seen on the tenant so far
- **sac-cli coverage** = what the repo can currently automate vs what is still missing

Strong take: stop treating “table widget functionality” like one thing. It is at least **four different lanes**:
1. **Builder authoring**
2. **Whole-table action menu**
3. **Header/cell context menus**
4. **Mode/property gates** that make options appear or disappear

If we flatten those, we end up lying about coverage.

---

## Inputs used

### PDF source
- `/Users/felixcardix/Downloads/sac-table-widget-functionality.pdf`
- scratch extraction support:
  - `tmp/table-widget-pdf-keyword-report.md`
  - `tmp/table-widget-pdf-pages/`

### Existing live SAC artifacts
- `docs/handoffs/2026-04-17-table-widget-functionality-map.md`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`
- `tmp/table-widget-api-harvest/2026-04-17T16-32-00-608Z/`
- screenshots / request captures referenced in that harvest folder

### Current repo/code surface
- `src/cmd/story.ts`
- `src/story/configure-table.ts`
- `tmp/table-widget-api-harvest.ts`
- `docs/handoffs/2026-04-17-sac-cli-attach-first-browser-handover.md`

---

## Ground rules from the PDF

The PDF is a **superset**, not a guarantee that every option appears in one widget state.

Visibility depends on:
- planning vs analytic vs BW vs HANA live connection
- classic / optimized / new table build experience
- edit mode vs view mode
- Advanced Mode on/off
- builder property switches like:
  - `Enable Quick Builder`
  - `Enable Data Analyzer`
  - `Enable Excel Add-in`
- the exact clicked surface:
  - whole table
  - header
  - dimension member header
  - data cell

So the right artifact is a **gated capability matrix**, not a dumb checklist.

---

## Current Decision Inc truth

### Live-proven so far
- attach-first / attach-only browser reuse is now wired in repo
- story table configure lane can:
  - reuse browser session plumbing
  - open the story route
  - insert/select table lane
  - bind model
  - fill variables
  - reach builder state
- builder surface was visibly proven with:
  - `Cross-tab`
  - `Adaptive Column Width`
  - `Arrange Totals / Parent Nodes Below`
  - rows / columns / filters sections
- generic member-selector dialog was proven live and captured
- whole-table action menu was proven live with at least these entries visible:
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
  - `Remove Reference`
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

### Important current limitation
The active widget/story state we harvested is **not yet a full proof of the new table build experience surface**.

We also have not yet cleanly exercised:
- `Open Quick Builder`
- deeper `Edit Scripts...` editor bootstrap
- deeper `Edit Styling...` open + mutation capture
- `Open Data Analyzer...`
- export execution
- copy/duplicate execution
- header/cell context-menu families

---

## Current sac-cli product surface

### Actually implemented commands
From `src/cmd/story.ts`:
- `story table configure`
- `story table inspect-menu`
- `story table inspect-gates`
- `story table add-row-dimension`
- `story table add-column-dimension`
- `story table set-filter`

### What `src/story/configure-table.ts` really automates today
- story route open/reuse
- optional table insert
- optional model bind
- variable fill
- row/column builder edits
- filter dialog handling (generic member-selector attempt)
- read-only whole-table menu inspection
- read-only property-gate inspection
- save checkpoints
- evidence capture / failure diagnostics

### What is **not** productized yet
No first-class CLI commands exist yet for:
- table type switching (`Cross-tab` / `Forecast Layout` / `Non-Aggregated List`)
- quick builder
- styling
- scripts
- copy / duplicate / copy-to
- export
- data analyzer
- show/hide options
- add-ons (`threshold`, `hyperlink`, `comment`, `in-cell chart`, linked analysis setup)
- header or cell context-menu operations
- planning/reporting/property toggles in the builder

### Scratch-only exploration
- `tmp/table-widget-api-harvest.ts` is useful reconnaissance, not a finished capability lane.

---

## Capability matrix

Legend:
- **Live** = what we have actually seen on the tenant so far
- **CLI** = repo/product automation state
- **Status** values:
  - `proven`
  - `partial`
  - `visible-not-exercised`
  - `pdf-only`
  - `not-seen`
  - `none`

---

## A. Builder / creation / table-type lane

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Add table to story and open builder | p.2-4 | **proven** | **proven** | Core configure lane already does this in one managed session. |
| Select other model / change model | p.3, p.72 | **proven** | **proven** | `maybeBindModel()` exists. |
| Variable prompt handling for planning model | p.2-3 (planning flow context) | **proven** | **proven** | Current hardcoded period/year fill is real but narrow. |
| Data Source info in builder | p.5, p.72 | **proven** | **partial** | Visible in UI; CLI reads via DOM implicitly but has no explicit capability/reporting verb. |
| Table Type = `Cross-tab` | p.3, p.6, p.73 | **proven** | **none** | Visible on live builder, but no CLI command to switch/assert it semantically. |
| Table Type = `Forecast Layout` | p.2-3, p.6, p.73, p.200-205 | **pdf-only** for this tenant/widget state | **none** | Must be treated as a separate planning-layout lane, not assumed from `Cross-tab`. |
| Table Type = `Non-Aggregated List` | p.3, p.6, p.15-16, p.73, p.119-120 | **pdf-only** | **none** | Gated to analytic + extended HANA live. Not relevant to current planning story unless we deliberately change lane. |
| Swap Axis from builder | p.5-6, p.72 | **visible** via PDF / menu; not cleanly exercised in current live harvest | **none** | Menu entry was visible live; builder action not yet isolated as a command. |
| Rows axis edits | p.6, p.75 | **proven** | **proven** | `add-row-dimension` exists. |
| Columns axis edits | p.6, p.75 | **proven** | **proven** | `add-column-dimension` exists. |
| Rearranging existing objects | p.6, p.75, p.82, p.87 | **visible-not-exercised** | **none** | PDF is clear; CLI has no reorder command. |
| Dimension quick actions: hierarchy / flat presentation / display options / rename / unbooked data | p.75 | **pdf-only** | **none** | Important because Quick Builder also claims to expose some of this. |
| Filters section basic member filter | p.2-4, p.77 | **partial** | **partial** | Dialog proven; full automated single-member commit still the flaky seam. |
| Date range filters / dynamic date filters | p.77 | **pdf-only** | **none** | Separate filter subtype. Don’t pretend generic member-selector covers it. |
| Visibility filters / invisible members | p.77 | **pdf-only** | **none** | Separate capability from restrictive filters. |
| Available Objects panel | p.72, p.82, p.84 | **pdf-only** | **none** | Useful future capability, especially for object discovery and drag/drop alternatives. |
| Table Add-Ons section | p.67-68, p.72 | **pdf-only** | **none** | This is a whole capability family, not one toggle. |
| Planning section | p.72, p.81 | **pdf-only** | **none** | Planning-specific builder controls not yet mapped on current story. |
| Reporting section | p.5, p.72, p.200 | **pdf-only** | **none** | Includes auto-size/pagination-related behaviors. |
| Properties section | p.5, p.81-82 | **partial** | **none** | Some properties are visible in live UI; no direct CLI/property setter exists. |

---

## B. Builder properties / table behavior / view-mode gates

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Adaptive Column Width | p.6, p.36-37, p.53, p.67 | **proven visible** | **none** | Seen in live builder; no explicit CLI operation. |
| Arrange Totals / Parent Nodes Below (legacy combined) | p.6 | **proven visible** | **none** | Seen in live builder. |
| Split settings for totals / parent nodes (new table build experience) | p.69 | **pdf-only** | **none** | Important distinction: legacy combined toggle vs new-build split controls. |
| Forecast summary / cut-over presentation | p.6, p.202-205 | **pdf-only** | **none** | Only matters after switching to `Forecast Layout`. |
| Optimized Presentation | p.2, p.6, p.34-37 | **pdf-only** | **none** | Needs a separate proof lane because it affects resize/scroll behavior. |
| Enable Quick Builder | p.70, p.82, p.87 | **not-seen on current live widget** | **partial** | `story table inspect-gates` can now read whether the property label is visible on the current widget state. |
| Enable Data Analyzer | p.9, p.21, p.81, p.87 | **not-seen as proven toggle** | **partial** | Property-gate inspection can now prove label visibility honestly, separate from menu execution. |
| Enable Excel Add-in | p.70, p.81, p.88 | **pdf-only** | **partial** | Property-gate inspection can prove if the label is visible in the current builder state. |
| Disable Interaction | p.9, p.82 | **pdf-only** | **partial** | Now inspectable as a visible gate label; still no mutating command. |
| Data Refresh modes | p.9, p.82 | **pdf-only** | **partial** | Read-only gate inspection exists; no mode-setting command yet. |
| Allow Data Point Comments | p.9, p.81 | **pdf-only** | **none** | Property gate for comment flows. |
| Intersecting client calculations priority | p.81 | **pdf-only** | **none** | Relevant once we support client calculations. |
| Auto-Size and Page Table Vertically | p.200 | **pdf-only** | **none** | Reporting/pagination lane, likely separate from normal responsive builder flow. |

---

## C. Whole-table action menu

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Applied to Table | p.18, p.27, p.68, p.84 | **proven** | **partial** | Live menu visible. `story table inspect-menu` now gives read-only proof of visibility, but not deeper action semantics. |
| Drill | p.19, p.27, p.85 | **proven visible** | **partial** | Inspectable as a visible menu entry; not exercised end-to-end yet. |
| Freeze | p.19, p.27, p.85 | **proven visible** | **partial** | Inspectable as a visible menu entry; no action command yet. |
| Ignore / Enforce Data Locks | p.11, p.19, p.27, p.85 | **proven visible** | **partial** | Menu inspection can see visibility, but no deeper toggle/action command yet. |
| Swap Axis | p.19, p.27, p.85 | **proven visible** | **partial** | Whole-table menu visibility can now be proven read-only. |
| Resize Table to Fit Content | p.19, p.85 | **proven visible** | **partial** | Read-only menu inspection exists; no mutation verb yet. |
| Mass Data Entry | p.10, p.18-19, p.28, p.78, p.85 | **proven visible** | **partial** | Planning workflow lane still not productized beyond menu visibility. |
| Distribute Values | p.25, p.33, p.92 | **proven visible** | **partial** | Inspectable as menu visibility only for now. |
| Manage Data Locks... | p.25, p.33, p.92 | **proven visible** | **partial** | Inspectable as menu visibility only for now. |
| Value Lock Management | p.17 | **proven visible** | **partial** | Inspectable as menu visibility only for now. |
| Remove Reference | current live screenshot, not strongly anchored in extracted PDF snippets | **proven visible** | **partial** | Live-visible and now capturable by `inspect-menu`; still keep the PDF evidence caveat. |
| Linked Analysis | p.18-19, p.27-28, p.35, p.68, p.85 | **proven visible** | **partial** | Menu visibility can be proven; builder add-on path still separate. |
| Add → Threshold | p.19, p.23, p.85, p.93 | **proven visible as submenu family** | **partial** | Parent menu entry visibility is inspectable; submenu action not productized. |
| Add → Hyperlink | p.19, p.68, p.85 | **proven visible as submenu family** | **partial** | Same. |
| Add → Comment | p.19, p.85 | **proven visible as submenu family** | **partial** | Same. |
| Show/Hide | p.19-20, p.86, p.88 | **proven visible** | **partial** | Whole-table entry is inspectable now; internal sub-options still unmapped. |
| Show/Hide → grid / headers / title / subtitle / details / formulas / refs / locks / warnings / zeros / nulls / hyperlinks / threshold tooltips / member-name modes | p.19-20, p.86 | **pdf-only / not individually exercised** | **none** | Must be split into sub-capabilities when implemented. |
| Copy | p.21, p.29, p.87 | **proven visible** | **partial** | `inspect-menu` can prove entry visibility; execution remains scratch-only/unproductized. |
| Copy To → new responsive / new canvas / existing page | p.21, p.29, p.87 | **submenu visible** | **none** | Needs execution proof. |
| Duplicate | p.21, p.29, p.68, p.87 | **submenu visible** | **none** | Need actual mutation and save/reopen proof. |
| Export | p.21, p.29, p.87 | **proven visible** | **partial** | Menu visibility is now a first-class read-only CLI slice. |
| Export → CSV / XLSX | p.21, p.29, p.87 | **proven visible in docs, not executed live** | **none** | Download-handling lane still missing. |
| Edit Styling... | p.21, p.30, p.39, p.87 | **proven visible** | **partial** | `inspect-menu` proves visibility; deeper open/mutation capture still missing. |
| Open Quick Builder | p.70, p.87 | **not seen in harvested widget state** | **partial** | `inspect-menu` can now prove absence/presence honestly on a live widget state once the property gate is set. |
| Edit Scripts... | p.20, p.87 | **proven visible** | **partial** | `inspect-menu` proves visibility; deeper script-editor lane not productized. |
| Open Data Analyzer... | p.21, p.62, p.87 | **not seen in harvested widget state** | **partial** | Same story as Quick Builder: inspectable if/when the gate is enabled. |
| Open in Excel Add-in... | p.70, p.88 | **not yet checked** | **partial** | Inspect-menu can become the honest read-only proof lane once the property gate exists. |
| Fullscreen | p.21, p.88 | **proven visible** | **partial** | Visibility inspectable; not yet exercised. |
| Lock in Place / Unlock in Place | p.21, p.88 | **proven visible** | **partial** | Visibility inspectable; not yet exercised. |
| Delete | p.21, p.88 | **proven visible** | **partial** | Visibility inspectable; destructive action remains intentionally separate. |

---

## D. Header and cell context-menu families

These are in the PDF, but we have **not** yet mapped them live on the Decision Inc lane.
This is the next big blind spot after whole-table actions.

### Table header menu

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Add Dynamic Text | p.88 | **pdf-only** | **none** | Header-specific, not whole-table menu. |
| Show/Hide title/subtitle/details | p.88 | **pdf-only** | **none** | Different from whole-table Show/Hide superset. |
| Swap Axis | p.88 | **pdf-only** | **none** | Header path to same behavior. |
| Table Functions | p.88 | **pdf-only** | **none** | Indirect link back to main context menu. |

### Dimension header menu

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Drill (Hierarchy Level) | p.89 | **pdf-only** | **none** | Header-specific path. |
| Select Hierarchy / flat presentation / show only leaves | p.75, p.89 | **pdf-only** | **none** | Important for hierarchy-aware automation. |
| Sort Options / custom order | p.69, p.89 | **pdf-only** | **none** | Forecast-layout/version caveats apply. |
| Display Options (description / ID / both) | p.75, p.89 | **pdf-only** | **none** | Also exposed via builder quick actions. |
| Show/Hide unbooked / totals / properties | p.13-14, p.89 | **pdf-only** | **none** | Complex and dimension-specific. |
| Add Member | p.89 | **pdf-only** | **none** | Planning/member-creation lane. |
| Jump To (BW live only) | p.89 | **pdf-only** | **none** | Not relevant to current planning story. |

### Dimension member / measure member header menus

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Filter Member / Exclude Member | p.90 | **pdf-only** | **none** | Different from builder filter dialog. |
| Add row / Add column (client calc) | p.90 | **pdf-only** | **none** | This is **not** the same as adding a model dimension via builder. |
| Add client calculation | p.90 | **pdf-only** | **none** | Separate calculation lane. |
| Remove row / Remove column | p.90 | **pdf-only** | **none** | Calculation-row lifecycle. |
| Hide row / Hide column | p.90 | **pdf-only** | **none** | Local structural hide, not filter. |
| Sort Options on measures/accounts | p.90 | **pdf-only** | **none** | Different semantics from dimension-header sorting. |

### Data-cell menu

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Compound Filter / Exclude | p.93 | **pdf-only** | **none** | Cell-context filtering, not builder filtering. |
| Add Data Point Comment | p.26, p.52, p.81, p.93 | **pdf-only** | **none** | Needs property gate and cell context. |
| Add Threshold | p.19, p.23, p.93, p.105-107 | **pdf-only** | **none** | Could pair well with add-ons later. |
| Rank | p.68, p.93 | **pdf-only** | **none** | New-build ranking lane. |
| Create Compass Simulation | p.93 | **pdf-only** | **none** | Far outside immediate table-authoring MVP. |
| Table Functions | p.93 | **pdf-only** | **none** | Link back to whole-table menu. |

---

## E. Add-ons / extended table enhancement family

These are real PDF surfaces, but they should not be mixed into the core builder authoring claim.

| Capability | PDF refs | Decision Inc live status | sac-cli status | Notes |
|---|---:|---|---|---|
| Thresholds from builder add-ons | p.67, p.105-107 | **pdf-only** | **none** | Distinct from context-menu threshold creation. |
| Hyperlinks from builder add-ons | p.68 | **pdf-only** | **none** | Distinct from menu open only. |
| In-Cell Charts from builder add-ons | p.68, p.108-110, p.198-199 | **pdf-only** | **none** | Separate panel + measure context. |
| Linked Analysis from builder add-ons | p.68 | **pdf-only** | **none** | Separate from merely seeing the menu entry. |
| Client calculations copy semantics | p.68, p.81 | **pdf-only** | **none** | Relevant once copy/duplicate/productized calc lanes exist. |
| Data point comments | p.9, p.26, p.52, p.81, p.93, p.176+ | **pdf-only** | **none** | Deep comment-specific lane with security/context rules. |
| Forecast / rolling forecast layout controls | p.138, p.159-162, p.200-205 | **pdf-only** | **none** | Needs its own slice; not just a toggle. |

---

## What this means for sac-cli scope right now

### Already real enough to build on
- attach-first existing-browser reuse
- story/table configure lane
- row/column builder edits
- generic filter/member-selector groundwork
- request-capture scratch harness for one-session table exploration

### Brutally not real yet
We do **not** yet have honest CLI coverage for most of the PDF table surface.

Current productized coverage is basically:
- get into the right story/table state
- manipulate builder rows/columns
- attempt filter member commit

Everything else is either:
- visible in SAC only,
- seen in scratch harvest only,
- or documented in the PDF but not proven on the Decision Inc widget state yet.

---

## Recommended next implementation order

### 1. Finish the property-gate truth lane
Before more menu archaeology, prove which current-table properties are on/off in the live widget:
- `Enable Quick Builder`
- `Enable Data Analyzer`
- `Enable Excel Add-in`
- current table type
- whether the story/table is actually in the new table build experience

Without that, missing menu items are just noise.

### 2. Productize whole-table menu open + inventory
Add a real read-only command first, something like:
- `story table inspect-menu`

Output should enumerate visible whole-table actions cleanly.
That gives us an honest baseline before mutating anything.

### 3. Productize property-gated action lanes one by one
Best order:
1. `open-quick-builder` (if gate can be enabled)
2. `open-styling`
3. `open-scripts`
4. `export`
5. `copy` / `duplicate`
6. `open-data-analyzer`

Each should be its own narrow capability with explicit proof.

### 4. Only then move to header/cell context menus
That is effectively a second wave, because it explodes the surface area.

### 5. Keep Forecast Layout separate
Do **not** bury forecast-layout work inside generic table configure.
It is a different planning capability lane with its own controls and constraints.

---

## Bottom line

The PDF says the SAC table widget is much richer than our current sac-cli story lane.
That’s not bad news — it’s clarity.

Honest current state:
- **builder entry + core row/column/filter shaping**: partially real
- **whole-table action menu inventory**: live-visible but mostly not productized
- **header/cell context menus**: largely unmapped in live repo work
- **property-gated/view-mode features**: mostly not instrumented yet

So the next correct move is **not** “more random clicking.”
It is:
1. lock down the property gates,
2. promote menu inspection into a first-class read-only command,
3. then promote one action at a time into honest capabilities.
