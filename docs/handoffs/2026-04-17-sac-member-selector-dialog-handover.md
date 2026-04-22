# SAC CLI Handover — 2026-04-17 — Member Selector Dialog Lane

## Timestamp
- Generated: 2026-04-17 17:18:31 BST
- Branch: `main`

## Why this handover exists
The story/table lane is no longer blocked by auth churn, stale story metadata, or unsaved empty-story reopen loops.

The active blocker is the **member-selection dialog** used when SAC asks us to choose members for a filter/dimension.

Current live failing example:
```bash
npm run cli -- --json --profile decisioninc-live story table configure --root .
```

Latest live failure:
- `STORY_TABLE_FILTER_VALUE_NOT_FOUND`
- target example: `Version -> Forecast`

## What is already good
Live green:
- `auth status`
- `data-action get`
- `formula validate`
- `formula verify-pilot`

Story/table improvements already landed:
- pilot story metadata now points at the dedicated responsive story:
  - `Hermes CLI table perfection 2026-04-17-08-44`
  - route: `#/story2&/s2/A721FE8644954AAA8DA56B1D0E35F653/?type=RESPONSIVE&mode=edit`
- story mutations now save checkpoints inside the same managed session/tab
- reopening no longer falls back to `Drag and drop a widget here` after every attempt
- failure diagnostics now capture:
  - `failure.png`
  - `failure-body.txt`
  - `failure-url.txt`
  - `failure-dialog.html`

## Core finding: this dialog is generic, not Version-specific
I inspected the captured live dialog HTML from:
- `~/.local/share/sac-cli/profiles/decisioninc-live/evidence/story-configure-table/failure-dialog.html`

The dialog root is generic SAC/UI5 member-selector chrome:
- root id: `__table0-Member-Filter`
- classes:
  - `member-selector`
  - `report-member-selector`
- generic sections:
  - `Available Members`
  - `Selected Members`
- generic search field:
  - `__table0-Member-Filter-ms-search-field`
- generic tree control:
  - `__table0-Member-Filter-custom-tree`
- generic member rows:
  - `sapUiTreeNode`
- generic checkbox widgets:
  - `sapEpmUiCheckBox`

The only Version-specific part is effectively the title and current members, e.g.:
- title: `Set Filters for Version`
- member rows like `Actual`, `Forecast`

There were **zero** occurrences of:
- `Audittrail`
- `Date`
- `Measures`
- `Reporting Account`
inside the captured Version dialog body except where they existed elsewhere on the page.

That strongly suggests the component itself is reusable and the dimension/member payload is what changes.

## Important DOM evidence
Example member row from the captured dialog:
- tree item title contains:
  - `ID: public.Actual`
  - `Display Name: Actual`
- the interactive control is **not** a normal browser checkbox with a nice accessible name
- instead it is nested SAP custom markup, e.g. a button inside `sapEpmUiCheckBox`

This explains why blunt Playwright patterns like:
- `getByRole('checkbox', { name: 'Forecast' })`
can fail even when the member is visibly present.

## Best next-session strategy
Do **not** keep treating this like loose visible-text clicking.

Treat it as one generic **member-selector component**.

### Recommended approach
1. Open the dialog normally from the active table builder.
2. Scope all DOM work to the dialog root:
   - `#__table0-Member-Filter`
   - or `.member-selector.report-member-selector`
3. Use the dialog-local search field when needed:
   - `#__table0-Member-Filter-ms-search-field`
4. Resolve target member rows inside the custom tree:
   - `#__table0-Member-Filter-custom-tree`
   - row title / text should expose both member id and display name
5. Click the **SAP custom checkbox button** inside the target tree row, not just the label text.
6. For single-value filters:
   - use `Clear Selection`
   - select the target member
   - verify `Selected Members` contains exactly that member
   - only then click `OK`
7. Save a story checkpoint in the same session immediately after dialog commit.

## Why this should generalize
If this works for `Version -> Forecast`, it should be reusable for:
- `Audittrail - DI Consol`
- `Date`
- `Reporting Account`
- other dimension/member dialogs that use the same member-selector shell

That means the correct product shape is **generic dialog handling**, not a Version-only hack.

## Honest caveat
I tried to reopen alternate filter dialogs from a fresh browser run to compare another dimension directly, but fresh builder selection from scratch is still flaky enough that I do **not** have a clean second captured dialog yet.

So the claim is:
- **strongly evidenced generic component** from live DOM structure
- **not yet double-proven across a second dimension dialog in a fresh run**

That is still enough to justify implementing the next fix as a generic member-selector helper.

## Update from the latest continuation attempt

### Auth/session reality
- The saved `decisioninc-live` browser session had silently fallen back to the SAP HANA Cloud Services `Log On` page.
- This was **not** a product/route regression in the story lane; it was plain expired auth.
- I restored the session on the same SAC Chrome profile and re-verified:
  ```bash
  npm run cli -- --enable-commands auth --json --profile decisioninc-live auth status
  ```
- Current result is green again:
  - `status = ok`
  - `currentUrl = https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html`

### Important credential-handling rule
- Emiliyan explicitly provided SAC credentials for the login recovery and explicitly said:
  - do **not** ask for them again
  - do **not** store them in the `sac-cli` repo
- I used them only to restore the live browser session.
- The one-off local login helper was kept under `/tmp/` and then deleted immediately.
- There are no SAC credentials committed or written into the repo handover.

### New repo-local planning / harvest artifacts
A new table-widget API harvest plan now exists:
- `docs/plans/2026-04-17-table-widget-api-harvest-plan.md`

It translates the PDF-driven table-widget surface into a concrete capture program covering:
- route/builder hydration
- table insert
- model bind
- variables
- row/column/filter flows
- quick actions:
  - `Open Quick Builder`
  - `Edit Scripts...`
  - `Copy`
  - `Edit Styling`
  - `Open Data Analyzer...`

A scratch harvest runner also exists:
- `tmp/table-widget-api-harvest.ts`

Important truth about that runner right now:
- it is **not** a finished productized seam
- the first runs mainly proved/recorded auth failure and some browser-side probe brittleness
- keep it as scratch infrastructure, not as proof that story-table APIs are already harvested cleanly

Failed/partial harvest artifacts from the auth-bad state:
- `tmp/table-widget-api-harvest/2026-04-17T15-18-02-140Z/`
- `tmp/table-widget-api-harvest/2026-04-17T15-21-15-581Z/`

### Fresh live truth after auth restore
After restoring auth, I reran:
```bash
npm run cli -- --json --profile decisioninc-live story table configure --root .
```

Current live result is still:
- `STORY_TABLE_FILTER_VALUE_NOT_FOUND`
- target: `Version -> Forecast`

So the blocker is still exactly where this handover said it was.
The auth detour did **not** change the core diagnosis.

### Fresh evidence confirming the live dialog state
Fresh failure diagnostics still show the responsive story route and the generic filter dialog content.
Most useful fresh file remains:
- `~/.local/share/sac-cli/profiles/decisioninc-live/evidence/story-configure-table/failure-body.txt`

Key lines in that body confirm:
- `Set Filters for Version`
- `Available Members`
- `Actual`
- `Budget`
- `Forecast`
- `Selected Members`
- currently selected: `Actual`
- buttons: `Clear Selection`, `OK`, `Cancel`

That means the problem is **not** that `Forecast` is absent.
The problem is still the interaction path into SAC’s custom member-selector control.

### Update after live proof
The repo-side generic member-selector helper was implemented in `src/story/configure-table.ts` and covered by targeted tests.

Live proof then required manual assistance because this environment still could not drive the Chrome UI directly.
Emiliyan manually set the selected table's filter to:
- `Version (1)`
- `Forecast`

A screenshot of the selected table builder state confirmed that exact target UI state.

I then re-queried the story content through authenticated `contentlib.getContent` using the existing Chrome session cookies and saw persisted content move from:
- before: `public.Actual = 32`, `public.Forecast = 0`
- after manual save: `public.Actual = 24`, `public.Forecast = 8`

So the important conclusion is:
- the member-selector outcome is now live-proven with manual UI evidence plus persisted backend evidence
- the remaining blocker is only local browser automation permissions in this environment, not SAC auth/session or missing product functionality

### Blunt next-session advice
Do **not** waste the next session on login or generic auth debugging unless `auth status` is red again.
Do **not** reopen the old question of whether `Forecast` exists in the dialog — that is settled.
If you need fully autonomous proof next time, focus only on unblocking local Chrome/macOS automation permissions for the already-working live story lane.

## Files most relevant next
- `src/story/configure-table.ts`
- `docs/plans/2026-04-17-table-widget-api-harvest-plan.md`
- `tmp/table-widget-api-harvest.ts`
- `docs/handoffs/2026-04-17-sac-cli-refinement-handover.md`
- `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`
- `~/.local/share/sac-cli/profiles/decisioninc-live/evidence/story-configure-table/failure-dialog.html`
- `~/.local/share/sac-cli/profiles/decisioninc-live/evidence/story-configure-table/failure-body.txt`

## Best next-session opener
Use this:

> Continue from `docs/handoffs/2026-04-17-sac-member-selector-dialog-handover.md`. Auth is already restored on the `decisioninc-live` SAC browser profile, so do not waste time re-debugging login unless `auth status` is red again. Treat the SAC filter/member popup as a generic `member-selector` component, not a Version-specific dialog. In `src/story/configure-table.ts`, scope interaction to the dialog root, target the custom tree row/checkbox control for the member, verify `Selected Members`, then commit with `OK` and save the story in the same managed session. Use `docs/plans/2026-04-17-table-widget-api-harvest-plan.md` and `tmp/table-widget-api-harvest.ts` only as support context for later API harvest work; first finish the live blocker by making `Version -> Forecast` work cleanly.
