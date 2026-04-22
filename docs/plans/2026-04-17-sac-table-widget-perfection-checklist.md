# SAC Table Widget Perfection Checklist

> **For Hermes:** execute this directly in the live tenant; capture one decisive seam per action, not a bullshit pile of noisy requests.

**Goal:** Fully exercise a planning-table widget inside `My Files / My Playground / CLI-Testing`, covering creation, model bind, variables, builder structure, filters, styling, advanced-mode actions, outline/scripting visibility, and the strongest API/seam candidates behind each step.

**Architecture:** Browser-first on the live SAC tenant, using the PDF as the product truth for expected options and the existing workflow-capture mindset for seam capture. Stay in a dedicated sandbox story so every action is attributable and recoverable.

**Tech Stack:** Playwright persistent Chrome context, live SAC responsive-story editor, SAC help PDF (`sac-table-widget-functionality...pdf`), temp evidence under `/tmp/`.

---

## Canonical references

- PDF: `upload_82ea3aa4465b_sac-table-widget-functionality---c0826c58-74a4-4cd0-96c2-079bfb29cea0.pdf`
- Key doc anchors already confirmed:
  - page 3: drag table → select model → builder opens
  - page 3 / 6: planning tables support `Cross-Tab` and `Forecast Layout`
  - page 20 / 87: `Edit Scripts...` exists for table widget when `Advanced Mode` is enabled
  - page 87: quick actions include `Open Quick Builder`, `Copy`, `Edit Styling`, `Open Data Analyzer...`
- Live tenant facts already proven:
  - `Advanced Mode` is a real toggle in the `View` group and is already ON in this tenant/session
  - table bind to `C_REPORTING_CLI_TESTING` is real
  - variable prompt fields accept direct IDs
  - blank table hydrates into builder state after variables are set

---

## Sandbox object strategy

- Keep work inside `My Files / My Playground / CLI-Testing`
- Prefer a dedicated story for the table lane instead of overloading the button proof story
- Story naming convention:
  - `Hermes CLI table perfection YYYY-MM-DD-HH-mm`
- Do not delete anything unless the folder becomes polluted enough to hurt testing

---

## Detailed execution checklist

### Phase 1 — Create the dedicated table story

- [ ] Create a fresh responsive story
- [ ] Save it immediately into `CLI-Testing`
- [ ] Capture screenshot after first save
- [ ] Record final story route/id

**Evidence to keep**
- save dialog screenshot
- saved story screenshot
- folder search/list screenshot proving the story exists in `CLI-Testing`

**Primary seam candidates**
- story save/create requests
- repository/contentlib requests tied to first save

---

### Phase 2 — Insert table and bind planning model

- [ ] Drag `Table` widget onto the responsive page
- [ ] Choose `Select other model...`
- [ ] Search and select `C_REPORTING_CLI_TESTING`
- [ ] Set variable IDs directly:
  - [ ] Current Period = `202004`
  - [ ] Prior Period = `202003`
  - [ ] Fiscal Year = `2020`
  - [ ] Prior Fiscal Year = `2019`
- [ ] Confirm the table reaches hydrated builder state

**Expected result**
- builder shows `Data Source = C_REPORTING_CLI_TESTING`
- table is in planning-table builder mode, not blank-widget mode

**Primary seam candidates**
- model-selection request
- variable-application request
- first table hydration / builder-state request

---

### Phase 3 — Builder structure perfection

Use the PDF’s documented planning-table path and prove each chunk.

#### 3A. Table type
- [ ] Capture current default table type (`Cross-Tab`)
- [ ] Switch to `Forecast Layout` if the option is available
- [ ] Capture resulting UI/state
- [ ] Switch back to `Cross-Tab` if that keeps later steps cleaner

#### 3B. Rows
- [ ] Add `Reporting Account`
- [ ] Add `Company Code - DI Consol`
- [ ] Capture builder state after each row addition

#### 3C. Columns
- [ ] Add `Audittrail - DI Consol`
- [ ] Add `Date`
- [ ] Add `Measures`
- [ ] Capture builder state after each column addition

#### 3D. Filters
- [ ] Open `Version` filter
- [ ] Remove `Actual` if preselected
- [ ] Set `Forecast`
- [ ] Confirm builder shows `Version Forecast`

#### 3E. Render truth
- [ ] Verify table renders actual grid data, not just the builder shell
- [ ] If it still fails, capture the exact requirement/error message and current row/column assignments

**Primary seam candidates**
- object/feed selection request when adding rows/columns
- filter mutation request for `Version`
- table-layout mutation request when changing table type

---

### Phase 4 — Styling panel exhaustive pass

For each section, change one setting at a time, wait for UI commit, then capture screenshot plus the strongest request if any.

#### 4A. Table selection
- [ ] Ensure the actual table widget is selected, not the page
- [ ] Confirm right panel is table/widget styling, not page styling

#### 4B. Size and position
- [ ] Change width
- [ ] Change height
- [ ] Change X/left
- [ ] Change Y/top
- [ ] Verify visual movement/resize

#### 4C. Widget presentation
- [ ] Change background colour if available
- [ ] Change border style/value if available
- [ ] Change any visible table template/theme option if exposed

#### 4D. Table-specific styling/settings from the panel or quick actions
- [ ] Open table styling/actions surface
- [ ] Record available options exactly as shown
- [ ] Change one safe option in each visible group

#### 4E. Persistence proof
- [ ] Save the story after styling edits
- [ ] Reload the same route
- [ ] Verify which styling edits persisted vs reverted

**Primary seam candidates**
- widget geometry mutation request
- style/template mutation request
- save request after styling changes

---

### Phase 5 — Advanced-mode table actions

Because the PDF explicitly names these, treat them as must-probe actions.

- [ ] Confirm `Advanced Mode` toggle remains ON
- [ ] Open the table widget’s quick-actions / more-actions menu
- [ ] Record presence/absence of:
  - [ ] `Open Quick Builder`
  - [ ] `Edit Scripts...`
  - [ ] `Copy`
  - [ ] `Edit Styling`
  - [ ] `Open Data Analyzer...`
- [ ] Open `Open Quick Builder` if available and capture what it exposes
- [ ] Open `Edit Scripts...` if available and capture the editor surface
- [ ] If `Open Data Analyzer...` is visible, open it only if it stays inside safe sandbox browsing and does not mutate content

**Primary seam candidates**
- menu-open request if any
- quick-builder data/layout request
- script-editor opening request

---

### Phase 6 — Outline and scripting truth

- [ ] Open `Outline`
- [ ] Capture structural tree with the table widget present
- [ ] Confirm widget ids / lane placement
- [ ] Open / inspect `Scripting` node if the UI permits
- [ ] Record whether widget-level scripting surfaces are discoverable from outline/scripting, or only from widget actions

**Primary seam candidates**
- outline tree request
- scripting metadata request

---

### Phase 7 — Perfection pass against PDF options

Check the PDF-derived list and explicitly mark each item as:
- `proven live`
- `visible but not yet exercised`
- `blocked by hydration / busy overlay / selector weakness`
- `not present on this tenant/widget state`

PDF-derived option set to reconcile:
- [ ] Cross-Tab
- [ ] Forecast Layout
- [ ] Builder rows/columns feeds
- [ ] Filter editing
- [ ] Styling
- [ ] Open Quick Builder
- [ ] Edit Scripts...
- [ ] Copy
- [ ] Open Data Analyzer...
- [ ] Advanced Mode dependency

---

## Execution rules

- Capture **one decisive request/response pair** per action when possible
- Do not pretend every visible change has already yielded a clean API seam
- If SAC shows a busy overlay, treat that as a state boundary — wait it out and only then continue
- If a control is inaccessible via normal click, inspect DOM ids/tooltips and use the exact stable control instead of random coordinate clicking
- If a setting changes visually but does not survive save/reload, mark it as `non-persistent proof only`

---

## Success criteria

This checklist is successful when all of the following are true:

- [ ] dedicated table story exists in `CLI-Testing`
- [ ] table widget is inserted and bound to `C_REPORTING_CLI_TESTING`
- [ ] variables are set and the table reaches a hydrated builder state
- [ ] rows, columns, and `Version = Forecast` are configured
- [ ] at least one rendered data-state screenshot exists
- [ ] at least one styling mutation is proven live
- [ ] save/reload persistence is tested for styling and/or builder changes
- [ ] advanced-mode table actions are enumerated with evidence
- [ ] outline/scripting visibility is captured with the table present
- [ ] the final report distinguishes live truth from assumptions cleanly

---

## Immediate next step

Start with **Phase 1** and do not stop at the checklist file. The file is the contract; the work starts now.
