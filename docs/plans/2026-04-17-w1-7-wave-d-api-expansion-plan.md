# SAC CLI W1.7 Wave D — API Expansion Plan

## Goal
Add more **semantic SAC capabilities** without turning the repo into a graveyard of random endpoints.

The rule stays the same:
**workflow capture -> seam extraction -> replay/diff hardening -> capability promotion**.

This wave is about expanding from the current proven base:
- `dataaction.validate`
- `story.copy`
- `story.save-page-title`
- reusable workflow capture artifacts

into the next real capability set, centered on **story/table authoring** and **safe repository/runtime APIs**.

---

## Core stance

1. **Semantic capability names only**
   - good: `story.table.bind-model`
   - bad: `contentlib.copyResource.v2`

2. **Auth once, then stay in-session**
   - no constant re-login churn
   - no reopen-after-every-click nonsense
   - only authenticate when SAC actually proves we are logged out

3. **One decisive capture per action**
   - do not dump 50 noisy requests into the repo
   - capture the winning request/response pair with route + runtime context

4. **Exact browser payload replay is the default for delicate authoring seams**
   - synthetic payloads are guilty until proven innocent

5. **No fake productization**
   - captured != replayable
   - replayable != promoted
   - promoted requires docs, tests, and live proof

---

## Wave D outcomes

By the end of this wave, the repo should have:
- a prioritized backlog of new semantic capabilities
- capture artifacts for the first table-authoring seams
- replay/diff evidence for the seams that survive patching
- capability docs for the seams honest enough to expose
- a clear split between:
  - `promoted`
  - `replayable`
  - `captured-only`
  - `blocked`

---

## Priority capability backlog

### Tier 1 — Safe, high-value, likely promotable next
These are the best next targets because they are narrow, user-visible, and already partially grounded by live proof.

1. `story.table.insert`
   - create table widget in responsive story
   - prove the decisive mutation seam behind Add Table

2. `story.table.bind-model`
   - bind table to `C_REPORTING_CLI_TESTING`
   - includes model picker / selected-model commit

3. `story.table.set-variables`
   - apply required variable values
   - Current Period / Prior Period / Fiscal Year / Prior Fiscal Year

4. `story.table.configure-layout`
   - `Cross-Tab`
   - `Forecast Layout`
   - honest result may end up as captured-only if payload volatility is ugly

5. `story.table.set-filter.version`
   - remove `Actual`
   - set `Forecast`

6. `story.table.add-row-dimension`
   - first target dimensions:
     - `Reporting Account`
     - `Company Code - DI Consol`

7. `story.table.add-column-dimension`
   - first target dimensions:
     - `Audittrail - DI Consol`
     - `Date`
     - `Measures`

8. `story.widget.style.geometry`
   - width / height / x / y
   - only promote if save/reload persistence is real

### Tier 2 — Useful, but likely more brittle
9. `story.table.open-quick-builder`
10. `story.table.open-data-analyzer`
11. `story.table.open-scripting`
12. `story.widget.copy`
13. `story.widget.style.edit`

These are worth capturing, but they may remain browser-only or captured-only until the seam is cleaner.

### Tier 3 — Discovery only until proven
14. `story.rename`
15. `story.move`
16. `story.create`
17. `story.update`

These have already shown signs of hidden content semantics and invalid-payload traps. Do not pretend they are near-ready just because we found adjacent endpoints.

---

## Execution order

### Phase 0 — Session discipline hardening
Before adding more APIs, lock the runtime discipline so we stop doing stupid things.

- add explicit auth gate before live browser work
- reuse one persistent profile/session (`decisioninc-live`)
- stop all blind retry loops
- cap replay attempts for any single live action
- treat busy overlay and hydration as state boundaries

**Exit criteria**
- live runs no longer churn through repeated SAML/login cycles
- capture runs stay in one story/tab context unless a step explicitly requires route change

---

### Phase 1 — Table workflow capture set
Use the existing sandbox lane:
- `My Files / My Playground / CLI-Testing`
- dedicated table story
- create-first, delete-last

Capture one decisive artifact for each of:
- `story.table.insert`
- `story.table.bind-model`
- `story.table.set-variables`
- `story.table.add-row-dimension`
- `story.table.add-column-dimension`
- `story.table.set-filter.version`
- `story.table.configure-layout`

**Deliverables**
- one `WorkflowCapture` artifact per capability candidate
- route-before / route-after truth
- tenant/runtime context
- request/response payloads
- blunt notes on whether the seam is:
  - stable
  - patchable
  - browser-only
  - garbage

**Exit criteria**
- at least 4 table capabilities captured cleanly
- at least 2 look replayable with surgical patching

---

### Phase 2 — Replay and patch-path hardening
For each promising table capability:
- replay the exact captured request
- patch only the semantic fields that should vary
- diff response and post-action UI state
- classify payload volatility

**What to record**
- stable paths
- volatile paths
- patch paths
- required prerequisite route/runtime state
- whether browser preconditioning is mandatory

**Exit criteria**
- at least 2 table capabilities upgraded from `captured` -> `replayable`
- failures documented as capability failure modes, not buried in chat history

---

### Phase 3 — Capability promotion
Promote only the seams that survive honest replay and verification.

First promotion order:
1. `story.table.bind-model`
2. `story.table.set-variables`
3. `story.table.set-filter.version`
4. `story.table.add-row-dimension`
5. `story.table.add-column-dimension`

`story.table.insert` may or may not promote first depending on whether the insert mutation is clean or browser-preconditioned chaos.

**Promotion requirements**
- capability registry entry
- capability markdown doc
- contract tests or replay tests
- explicit lane classification:
  - `internal-api`
  - `browser-only`
  - `hybrid`
- live-proof summary
- known failure modes

**Exit criteria**
- at least 2 new promoted capabilities
- no promoted capability that still depends on hand-wavy undocumented assumptions

---

### Phase 4 — Stretch lane: advanced-mode widget surfaces
Only after Tier 1 is solid.

Probe and classify:
- `story.table.open-quick-builder`
- `story.table.open-scripting`
- `story.table.open-data-analyzer`
- `story.widget.copy`
- `story.widget.style.edit`

This phase is mainly for seam discovery and backlog shaping, not guaranteed promotion.

---

## Repo changes expected in this wave

### Likely new/updated areas
- `docs/capabilities/*.md`
- `src/capture/**`
- `src/replay/**`
- `src/registry/**`
- `tests/capture/**`
- `tests/replay/**`
- `tests/registry/**`
- redacted fixtures/artifacts for promoted capabilities

### Not the goal of this wave
- broad generic story CRUD
- fake “all SAC APIs” inventory
- public CLI surface for every captured seam
- deleting sandbox objects as part of the main lane

---

## Capability status model for this wave

Every candidate must be tagged as one of:

### `captured`
We saw the real seam and stored the artifact.

### `replayable`
We can replay with limited patching and get the expected live behavior.

### `promoted`
We have tests, docs, live proof, and an honest semantic contract.

### `blocked`
We know why it is not ready:
- hidden content semantics
- hydration/busy overlay coupling
- brittle route/runtime dependency
- payload volatility too high
- no clean post-action verification

---

## Success criteria

This wave is successful if all of the following are true:

- [ ] auth/session discipline is fixed enough to avoid re-login loops
- [ ] table-authoring capture set exists for the main Tier-1 seams
- [ ] at least 2 new capabilities are honestly replayable
- [ ] at least 2 new capabilities are honestly promoted
- [ ] each promoted capability has docs + tests + failure modes
- [ ] blocked seams are documented explicitly instead of being quietly abandoned

---

## Recommended first implementation slice

If we want the smartest first cut, do this exact sequence:

1. harden the live auth/session gate
2. capture `story.table.bind-model`
3. capture `story.table.set-variables`
4. capture `story.table.set-filter.version`
5. replay/diff those three
6. promote the ones that survive
7. only then move to row/column feeds and advanced-mode surfaces

That order gives the best ratio of signal to pain.

---

## Blunt non-claims

This plan does **not** claim:
- that every visible SAC action has a clean reusable API
- that story create/update is close to solved
- that styling mutations will persist cleanly after save/reload
- that table insert/model bind/filter/layout will all use the same endpoint family

We earn each claim separately.

---

## Next question after Wave D

Not “what random endpoint should we poke next?”

The real next question is:
**which table/story authoring seams are stable enough to become product primitives, and which ones should stay browser-backed forever?**
