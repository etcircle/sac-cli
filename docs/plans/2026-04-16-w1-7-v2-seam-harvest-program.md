# SAC CLI W1.7 / V2 — Seam Harvesting and Capability Promotion Program

> **For Hermes:** Use subagent-driven-development for execution, but keep seam classification, fixture normalization, and contract-critical capability promotion in the parent session first.

**Goal:** Turn today’s one-off internal API wins into a repeatable program that can discover, classify, harden, and productize many more SAC authoring capabilities without degenerating into a random endpoint scrapbook.

**Architecture:** W1.6 proved the first honest hybrid pattern: browser-backed auth and route context, internal API replay for precision, and surgical patching of captured payloads for truth. W1.7 should productize that discovery loop itself: capture workflows, normalize payloads, register seams, replay exact payloads, patch only business inputs, and promote stable capabilities into semantic commands. V2 then broadens that engine from the pilot AF lane into story lifecycle, story authoring, and deeper data-action authoring.

**Tech Stack:** TypeScript, Node.js, Playwright persistent browser context, YAML/JSON fixtures, Zod, Vitest, repo-local docs/plans/handoffs

---

## Why this is the next honest wave

Current repo and live-runtime truth:
- `auth`, `data-action`, and `formula` command families exist on `main`
- browser-backed auth bootstrap is live and works against the real tenant via profile `decisioninc-live`
- read-only `objectmgr` seams are working for:
  - `data-action get`
  - `data-action steps`
  - `formula validate`
- `formula validate` only became honest after reusing the browser’s real `objectmgr validate` payload and patching only the target step’s `scriptContent`
- story browser save is proven in a non-public artifact under `My Files / My Playground`
- internal API story duplication is proven through `contentlib.copyResource`
- generic story `createContent` / cloned `updateContent` is **not** productized yet; naive replay still fails with `DASHBOARD_CONTENT_INVALID`

So the next move is **not** “add a few more commands.”
The next move is to build the machinery that lets us scale internal API discovery and promotion without lying to ourselves.

---

## Strong opinion: scale by workflow, not by endpoint

Wrong mindset:
- collect undocumented URLs
- dump payloads into fixtures
- hope they generalize

Right mindset:
- pick a concrete user intent
- capture the browser traffic for that exact workflow
- classify which requests are authoring-critical
- replay the exact winning request
- patch one business field at a time
- promote the capability only after contract and live proof exist

That is the whole game.

---

## W1.7 immediate objective

W1.7 should build the **seam harvesting program** around the first proven capabilities.

By the end of W1.7 we should have:
1. a workflow capture harness that records live SAC authoring requests with route/context metadata
2. a seam registry that stores capability-centric entries instead of raw endpoint trivia
3. a replay/diff tool that compares:
   - captured payload
   - minimal synthetic payload
   - patched payload
4. at least 3 promoted capability lanes with fixtures + contracts + live proof
5. a blunt classification of which story/data-action flows are:
   - browser-only for now
   - internal-API-assisted
   - fully replayable through internal APIs

### W1.7 capability targets

These are the first honest target lanes:
- `story.copy` via `contentlib.copyResource`
- `story.save-page-edit` via browser proof + saved reload verification
- `dataaction.validate` via captured `objectmgr validate`
- optional if time allows:
  - `story.open-metadata`
  - `story.move-or-copy-to-folder`
  - `story.rename` only if a real seam is captured and replayed successfully

### W1.7 explicitly in scope
- workflow capture harness
- capture artifact format
- seam registry format + typed loader
- request replay helpers
- diff/normalization tooling
- contract tests for promoted seams
- docs/handoffs that keep the program coherent across sessions

### W1.7 explicitly out of scope
- generic story creation from scratch
- broad widget authoring surface
- arbitrary save/apply mutation coverage
- fake “universal SAC client” abstractions
- mass command-surface expansion
- pretending `createContent` is solved when it plainly isn’t

---

## V2 objective

V2 should turn the seam-harvesting engine into a **capability platform**.

By the end of V2 we want:
1. a stable registry of proven semantic capabilities
2. artifact-first commands that can choose browser-only / API-only / hybrid execution under the hood
3. coverage for repository lifecycle and first serious authoring moves
4. enough capture/replay discipline that adding a new capability is routine rather than artisanal

### V2 target capability families

#### Family A — repository/content lifecycle
- duplicate story
- move story
- rename story
- save story
- save-as story
- duplicate data action
- move/rename data action

#### Family B — story authoring primitives
- create story shell
- add page
- change page title
- add table widget
- bind widget to model
- set core table builder state
- save + reopen verification

#### Family C — data-action authoring primitives
- duplicate data action
- add AF step
- edit AF step
- validate AF script
- save/apply once the seam is genuinely proven

#### Family D — support tooling
- seam health checks
- fixture redaction
- payload volatility classification
- route/context preflight checks
- capability confidence scoring

---

## Program rules

### Rule 1: Every promoted seam starts as a workflow capture
A seam is not “real” because we guessed a payload.
A seam is real only after:
- the browser successfully performed the workflow
- we captured the relevant request/response
- replay reproduced the result

### Rule 2: Preserve more payload than you think you need
W1.6 already proved the minimal-payload instinct is dangerous.
For delicate SAC authoring seams, preserve:
- sibling step metadata
- prompt/parameter structures
- runtime context slices
- auxiliary flags like `sequenceId`, `loadScriptContents`, `bDefaultCubeChanged`
until replay experiments prove they can be reduced safely.

### Rule 3: Capability registry entries are semantic
Registry key examples:
- `story.copy`
- `story.save-page-title`
- `story.rename`
- `story.move`
- `dataaction.validate`
- `dataaction.copy`

Not:
- `contentlib.copyResource`
- `contentlib.updateContent`
- `/sap/fpa/services/rest/epm/objectmgr`

Endpoints are implementation details. Capability names are product truth.

### Rule 4: Promotion requires both contract proof and live proof
A seam is promoted only after:
- replayable fixture exists
- contract test exists
- live tenant proof exists
- failure mode is classified

### Rule 5: Browser remains a first-class discovery/fallback lane
Do not treat browser automation as shameful fallback. In SAC it is a discovery instrument and, sometimes, the only honest proof lane.

---

## File plan

### New docs expected
- `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md`
- `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md`
- `docs/capabilities/README.md`
- `docs/capabilities/story.copy.md`
- `docs/capabilities/dataaction.validate.md`
- `docs/capabilities/story.save-page-title.md`

### New source files likely
- `src/capture/workflow-capture.ts`
- `src/capture/types.ts`
- `src/capture/redaction.ts`
- `src/registry/capability-registry.ts`
- `src/registry/schema.ts`
- `src/replay/request-replay.ts`
- `src/replay/diff.ts`
- `src/replay/payload-patchers.ts`
- `src/cmd/capture.ts` or `src/cmd/seams.ts` (only if the command surface stays honest)
- `src/capabilities/story/copy.ts`
- `src/capabilities/story/save-page-title.ts`
- `src/capabilities/data-action/validate.ts`

### New test files likely
- `tests/capture/workflow-capture.spec.ts`
- `tests/registry/capability-registry.spec.ts`
- `tests/replay/diff.spec.ts`
- `tests/contract/story.copy.spec.ts`
- `tests/contract/story.save-page-title.spec.ts`
- `tests/contract/dataaction.validate.promoted.spec.ts`

### Fixture folders likely
- `fixtures/redacted/story.copy/`
- `fixtures/redacted/story.save-page-title/`
- `fixtures/redacted/dataaction.validate/`

---

## Task breakdown

## Task 1: Freeze the seam-harvest artifact format

**Objective:** Define the capture/registry/replay document shapes before tools and tests drift.

**Files:**
- Create: `src/capture/types.ts`
- Create: `src/registry/schema.ts`
- Create: `tests/capture/workflow-capture.spec.ts`
- Create: `tests/registry/capability-registry.spec.ts`

**Must define:**
- workflow capture envelope
- request record shape
- response record shape
- route/runtime context block
- volatility classification fields
- capability registry entry shape
- confidence/status enum (`captured`, `replayable`, `promoted`, `stale`)

**Verification:**
```bash
npm run test -- tests/capture/workflow-capture.spec.ts tests/registry/capability-registry.spec.ts
```

---

## Task 2: Build the workflow capture harness

**Objective:** Capture live SAC authoring workflows with enough context to promote seams later.

**Files:**
- Create: `src/capture/workflow-capture.ts`
- Create: `src/capture/redaction.ts`
- Modify: `src/session/browser-session.ts` if extra request hooks are needed
- Test: `tests/capture/workflow-capture.spec.ts`

**Must capture:**
- route before action
- actor/workflow label
- request method/url/body
- response status/body snippet
- tenant/runtime context
- captured-at timestamp

**Initial workflows to support:**
- story open/edit
- story copy
- story save page-title edit
- data-action validate

---

## Task 3: Build replay + diff tooling

**Objective:** Compare captured payloads against reduced or patched variants and make deltas explicit.

**Files:**
- Create: `src/replay/request-replay.ts`
- Create: `src/replay/diff.ts`
- Create: `src/replay/payload-patchers.ts`
- Create: `tests/replay/diff.spec.ts`

**Must support:**
- exact replay
- replay with one-field patch
- structured JSON diff summary
- classification of stable vs volatile fields

**This is the core W1.7 lever.**
Without this, future discovery turns into cargo culting payload blobs.

---

## Task 4: Promote `story.copy` as the first repository-lifecycle seam

**Objective:** Turn the proven `contentlib.copyResource` win into a documented, tested capability.

**Files:**
- Create: `src/capabilities/story/copy.ts`
- Create: `tests/contract/story.copy.spec.ts`
- Create: `docs/capabilities/story.copy.md`
- Create: `fixtures/redacted/story.copy/`

**Live truth already known:**
- `copyResource` can duplicate story `6441DE864495C73F5BCA84DEF179F641`
- copying to `PRIVATE_ETANEV` worked and returned `targetResourceId`
- same-folder copy into `My Playground` with the same name fails with `RESOURCE_SAME_NAME_EXIST_IN_SAME_FOLDER`

**Required outcome:**
- documented request shape
- contract test around the replay shape
- explicit caveat that rename-on-copy is not yet solved

---

## Task 5: Promote `story.save-page-title` as the first browser-backed mutation proof

**Objective:** Productize the proven browser save lane as a named capability with verification discipline.

**Files:**
- Create: `src/capabilities/story/save-page-title.ts`
- Create: `tests/contract/story.save-page-title.spec.ts`
- Create: `docs/capabilities/story.save-page-title.md`
- Create: `fixtures/redacted/story.save-page-title/`

**Live truth already known:**
- editing the page title in the story right-side properties panel works
- `Meta+S` persists the change even when the visible Save control is awkward or absent
- reload/reopen verification is mandatory

**Required outcome:**
- semantic capability wrapper
- clear proof procedure
- no lies about broader story save coverage

---

## Task 6: Reframe `dataaction.validate` as the template for delicate API promotion

**Objective:** Make the captured-payload replay pattern a first-class product rule, not a one-off trick.

**Files:**
- Modify: `src/formula/validate.ts`
- Create: `docs/capabilities/dataaction.validate.md`
- Create: `fixtures/redacted/dataaction.validate/README.md`
- Modify: `tests/formula/validate.spec.ts`

**Must document explicitly:**
- minimal payload replay is unreliable
- exact capture + surgical patch is the honest baseline
- this pattern should be assumed for future delicate seams until proven otherwise

---

## Task 7: Stand up the capability registry docs

**Objective:** Keep new seams organized by capability, proof status, and risk.

**Files:**
- Create: `docs/capabilities/README.md`
- Create: registry-backed markdown stubs for the first promoted capabilities

**Registry entry must include:**
- capability name
- underlying endpoint/action
- route prerequisite
- auth/context requirement
- payload patch strategy
- live proof status
- contract fixture location
- known failure modes

---

## Task 8: Write the V2 execution map before implementing V2 breadth

**Objective:** Stop W1.7 from sprawling by locking which V2 families come next.

**Files:**
- Modify: this plan doc or add a follow-on V2 execution plan once W1.7 lands

**V2 first execution order should be:**
1. repository lifecycle completion (`move`, `rename`, `save-as`)
2. story shell creation / save-as capture
3. widget insertion + model binding proof
4. data-action duplication + save/apply capture

---

## Acceptance criteria

W1.7 is done only if all are true:
- at least 3 capabilities are documented in `docs/capabilities/`
- each promoted capability has:
  - a redacted fixture folder
  - at least one contract test
  - a live-proof note
- replay/diff tooling exists and is used by at least one promoted seam
- no new command claims broader mutation support than we actually proved
- docs clearly distinguish:
  - browser-only proof
  - API-assisted proof
  - replayable API seam

V2 planning is good only if it stays capability-family based and does not collapse back into endpoint collecting.

---

## Verification commands

Current repo verification baseline after each wave:
```bash
npm run test
npm run test:contract
npm run typecheck
npm run build
```

Live verification examples should remain explicit and narrow:
```bash
npm run cli -- --json --profile decisioninc-live formula validate --root .
```

For capture/replay work, keep browser proof artifacts local-only unless redacted and intentionally checked in.

---

## Risks and blunt caveats

1. **Story `createContent` is still not honest.**
   We proved naive replay is invalid. Don’t market generic story creation yet.

2. **Rename/move may require a different seam than copy.**
   Do not assume `copyResource` implies rename-on-copy or same-folder duplicate semantics.

3. **Payload minimization is seductive bullshit.**
   Keep captured context until the diff tool proves it can be safely removed.

4. **Browser save proof is capability-specific, not universal mutation proof.**
   A successful page-title save does not mean widget layout save or story-wide metadata save is equally solved.

---

## Source-of-truth relationship

- `docs/plans/2026-04-16-w1-6-read-only-seam-spine.md` = completed read-only spine plan
- `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md` = new current program plan
- `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md` = next-session continuation brief

This doc is the new planning source of truth for the next session.