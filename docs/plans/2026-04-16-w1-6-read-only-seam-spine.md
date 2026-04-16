# SAC CLI W1.6 — Read-Only `objectmgr` Spine Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, but keep the contract-critical command/service spine in the parent session first.

**Goal:** Turn the one-off `formula verify-pilot` proof into an honest, reusable read-only runtime for data-action metadata and Advanced Formula validation without adding apply/save lies.

**Architecture:** W1.5b already proved browser-backed auth, frozen pilot inputs, non-mutating AF reopen/readback, evidence writing, and two-pass stable hashes. W1.6 should not jump to mutation. It should extract the smallest reusable session-backed seam from that proof: a page-context fetch helper, a typed read-only `objectmgr` client, real `data-action` read commands, and a real `formula validate` command. Keep browser DOM readback only where SAC still forces it.

**Tech Stack:** TypeScript, Node.js, Playwright persistent browser context, YAML, Zod, Vitest

---

## Why this is the next honest wave

W1.5b already landed in `e82903f feat: add pilot AF verify proof lane`.

Current repo truth:
- `formula verify-pilot` exists and is wired in `src/cmd/formula.ts`
- `src/formula/verify-pilot.ts` reopens the frozen pilot target, does DOM readback, emits evidence, and proves stable two-pass hashes
- `doctor pilot` validates the checked-in `pilot/` bundle
- `data-action get` and `data-action steps` are still placeholders in `src/cmd/root.ts`
- there is no reusable `objectmgr` seam client
- there is no `formula validate` command
- `test:contract` currently passes with no meaningful contract tests

So the next move is not “more verify-pilot” and definitely not “apply/save”.
The next move is a narrow read-only `objectmgr` spine.

---

## Hard scope gate for W1.6

W1.6 is in scope only if it directly supports this loop:
1. reuse the authenticated browser session
2. call proven internal read-only seams from page context
3. resolve data-action metadata for the frozen pilot target
4. validate Advanced Formula text through `objectmgr callFunction(validate)`
5. expose honest read-only commands with stable envelopes
6. optionally reuse those seams inside `formula verify-pilot` where that improves evidence quality without destabilizing the existing proof

### Explicitly in scope
- `src/cmd/data-action.ts` command module
- page-context fetch helper for browser-session-backed seam calls
- typed `objectmgr.readObject` client
- typed `objectmgr.callFunction(validate)` client for the pilot AF step
- minimal redacted `objectmgr` fixtures copied from existing recon artifacts
- real `data-action get`
- real `data-action steps`
- real `formula validate`
- shared formula validation types used by both validate flow and verify-pilot
- optional upgrade of `formula verify-pilot` to prefer seam-backed validation while keeping the current reopen/readback proof intact

### Explicitly out of scope
- formula apply
- data-action save/update
- story save/edit mutation
- generic discovery across all SAC object types
- `contentlib` write/edit-lock automation
- broad capability registry / resolver framework
- “versions” command family unless a W1.6 command genuinely needs it
- broad browser framework abstraction beyond what the read-only seam actually requires

---

## Ground truth to reuse

### Repo-local truth
- `README.md`
- `docs/architecture.md`
- `docs/v0-scope.md`
- `pilot/`
- `src/formula/verify-pilot.ts`
- `src/pilot/bundle.ts`
- `src/session/browser-session.ts`
- `tests/formula/verify-pilot.spec.ts`
- `tests/pilot/pilot-bundle.spec.ts`

### External captured truth already available
These are inputs, not rediscovery work.
- `~/.hermes/handoffs/sac-api-recon-2026-04-15_143009/RECON_NOTES.md`
- `~/.hermes/handoffs/sac-api-recon-2026-04-15_143009/data-action-edit.json`
- `~/.hermes/handoffs/sac-api-recon-2026-04-15_143009/summary.json`
- `~/.hermes/handoffs/sac-agent-handover-2026-04-15.md`
- `~/.hermes/handoffs/chatgpt-pro/2026-04-15_121226-sac-agent-architecture/RESPONSE.md`

### Proved seam candidates from recon
- `POST /sap/fpa/services/rest/epm/objectmgr?tenant=J` with:
  - `action=readObject`
  - `action=callFunction` for `PLANNINGSEQUENCE.validate`

Strong opinion: do **not** drag `contentlib` or internal model versions into W1.6 unless one of the W1.6 commands genuinely needs them.
The repo does not need fake completeness.

---

## Public surface after W1.6

If W1.6 lands cleanly, the public command surface should be:

```bash
npm run cli -- --json --profile <name> data-action get --root <path>
npm run cli -- --json --profile <name> data-action steps --root <path>
npm run cli -- --json --profile <name> formula validate --root <path>
npm run cli -- --json --profile <name> formula verify-pilot --root <path>
```

Notes:
- `--root <path>` should default to `process.cwd()` and point at a project containing `pilot/`
- these commands stay pilot-bundle-centric for now
- no generic `--target`, `--step-id`, `--file`, or raw object-id flags yet unless the implementation proves they stay honest and simpler than the bundle-first contract

---

## File plan

### New files expected
- `src/cmd/data-action.ts`
- `src/data-action/read.ts`
- `src/formula/types.ts`
- `src/formula/validate.ts`
- `src/session/page-fetch.ts`
- `src/seams/objectmgr/client.ts`
- `tests/cmd/data-action.spec.ts`
- `tests/session/page-fetch.spec.ts`
- `tests/contract/objectmgr.readObject.spec.ts`
- `tests/contract/objectmgr.validate.spec.ts`
- `tests/helpers/objectmgr-fixtures.ts`
- `tests/data-action/read.spec.ts`
- `tests/formula/validate.spec.ts`
- `fixtures/redacted/objectmgr.readObject.request.json`
- `fixtures/redacted/objectmgr.readObject.response.json`
- `fixtures/redacted/objectmgr.validate.request.json`
- `fixtures/redacted/objectmgr.validate.response.json`

### Existing files expected to change
- `src/cmd/root.ts`
- `src/cmd/formula.ts`
- `src/formula/verify-pilot.ts`
- `README.md`
- `tests/cmd/root.spec.ts`
- `tests/cmd/formula.spec.ts`
- `tests/formula/verify-pilot.spec.ts` if validation sourcing is upgraded

---

## Contract-critical rules

1. **Parent owns these first:**
   - `data-action` command module contract
   - `formula validate` command contract
   - shared formula validation types
   - page-context fetch interface
   - normalized `objectmgr` DTO shapes
   - command envelope shapes

2. **No Node-side cookie jar cosplay.**
   - requests must execute through the authenticated browser page/context
   - do not replay copied cookies in raw Node fetch just because it feels easier

3. **Keep the bundle-first contract.**
   - W1.6 commands should consume the frozen `pilot/` bundle and profile resolution first
   - do not introduce ad-hoc target flags that bypass the checked-in proof contract unless there is a compelling simplification

4. **Read-only means read-only.**
   - no `startEdit`, `stopEdit`, save, apply, publish, or update calls in W1.6
   - if an endpoint or payload smells mutating, leave it out

5. **Keep provenance explicit in outputs.**
   - bundle facts stay visibly separate from live seam facts where it matters
   - do not flatten bundle/deployment/live fields into one lying blob

6. **`test:contract` must stop being fake.**
   - targeted contract tests must exist and pass
   - `npm run test:contract` is a regression umbrella, not the only acceptance proof

---

## Task breakdown

### Task 1: Freeze W1.6 command and shared type contracts in the parent session

**Objective:** Lock the public read-only shape before implementation drifts.

**Files:**
- Create: `src/cmd/data-action.ts`
- Create: `src/formula/types.ts`
- Modify: `src/cmd/root.ts`
- Modify: `src/cmd/formula.ts`
- Test: `tests/cmd/root.spec.ts`
- Test: `tests/cmd/formula.spec.ts`
- Create: `tests/cmd/data-action.spec.ts`

**Step 1: Extract shared formula validation types**

Move the existing validation types out of `src/formula/verify-pilot.ts` into `src/formula/types.ts`:
- `FormulaValidationIssue`
- `FormulaValidationResult`

Do not duplicate them in a second DTO file.

**Step 2: Add the `data-action` command module shell**

Mirror the existing repo pattern used by `src/cmd/auth.ts` and `src/cmd/formula.ts`:
- define `DataActionServices`
- register `get` and `steps`
- keep real behavior injectable

Do **not** expand real `data-action` command logic directly inside `src/cmd/root.ts`.

**Step 3: Lock envelope shapes**

Expected command outputs:
- `data-action get` returns:
  - `bundle`
  - `deployment`
  - `live`
- `data-action steps` returns ordered normalized step summaries and marks the proof step
- `formula validate` returns normalized `FormulaValidationResult`
- `formula verify-pilot` keeps its current evidence-focused shape and may add `validationSource: 'objectmgr' | 'dom-fallback'`

**Step 4: Write failing CLI wiring tests first**

Tests must prove:
- `data-action get` and `steps` route through `DataActionServices`
- `formula validate` routes through `FormulaServices`
- stable JSON envelope behavior is preserved

**Step 5: Run targeted tests**

Run:
```bash
npm run test -- tests/cmd/root.spec.ts tests/cmd/formula.spec.ts tests/cmd/data-action.spec.ts
```

Expected:
- FAIL first for unimplemented read-only command wiring

**Step 6: Commit**

```bash
git add src/cmd/data-action.ts src/formula/types.ts src/cmd/root.ts src/cmd/formula.ts tests/cmd/root.spec.ts tests/cmd/formula.spec.ts tests/cmd/data-action.spec.ts
git commit -m "test(cli): freeze w1.6 read-only command contracts"
```

---

### Task 2: Check in redacted `objectmgr` fixtures and contract tests

**Objective:** Make raw payload shapes concrete before transport/client abstractions spread.

**Files:**
- Create: `fixtures/redacted/objectmgr.readObject.request.json`
- Create: `fixtures/redacted/objectmgr.readObject.response.json`
- Create: `fixtures/redacted/objectmgr.validate.request.json`
- Create: `fixtures/redacted/objectmgr.validate.response.json`
- Create: `tests/helpers/objectmgr-fixtures.ts`
- Create: `tests/contract/objectmgr.readObject.spec.ts`
- Create: `tests/contract/objectmgr.validate.spec.ts`

**Step 1: Copy only the minimum fixture payloads**

Use the existing recon artifacts under `~/.hermes/handoffs/sac-api-recon-2026-04-15_143009`.

Rules:
- redact tenant-specific domains, emails, and unstable IDs not required by the contract
- preserve the real payload shape for:
  - `PLANNINGSEQUENCE`
  - pilot step identity
  - validation result structure
- do not dump the whole capture folder into the repo like an animal

**Step 2: Write failing contract tests**

Contract tests must prove:
- raw `readObject` payload can normalize into the W1.6 live output shape
- raw `validate` payload can normalize into `FormulaValidationResult`
- line/column-ish issue metadata survives normalization if present
- missing expected fields fail loudly

**Step 3: Run targeted contract tests**

Run:
```bash
npm run test -- tests/contract/objectmgr.readObject.spec.ts tests/contract/objectmgr.validate.spec.ts
npm run test:contract
```

Expected:
- targeted tests PASS
- `test:contract` also passes

**Step 4: Commit**

```bash
git add fixtures/redacted tests/helpers/objectmgr-fixtures.ts tests/contract/objectmgr.readObject.spec.ts tests/contract/objectmgr.validate.spec.ts
git commit -m "test(contract): add redacted objectmgr fixtures for w1.6"
```

---

### Task 3: Add page-context fetch helper

**Objective:** Establish the minimal reusable transport for browser-session-backed seam calls.

**Files:**
- Create: `src/session/page-fetch.ts`
- Test: `tests/session/page-fetch.spec.ts`
- Reference: `src/session/browser-session.ts`

**Step 1: Write failing transport tests**

Tests must prove:
- fetch executes through `page.evaluate`
- request can target the SAC app origin derived from the resolved profile
- helper fails clearly if `page.evaluate` is unavailable
- helper returns parsed JSON without leaking transport weirdness into callers

**Step 2: Implement the smallest transport possible**

Requirements:
- support method, relative seam path, headers, and JSON body
- build absolute request URL from resolved profile tenant/app origin
- return parsed JSON body
- keep CSRF handling private to the seam client until more than one client genuinely needs shared token logic

**Step 3: Run targeted tests**

Run:
```bash
npm run test -- tests/session/page-fetch.spec.ts
```

Expected:
- PASS

**Step 4: Commit**

```bash
git add src/session/page-fetch.ts tests/session/page-fetch.spec.ts
git commit -m "feat(session): add page-context fetch helper for read-only seams"
```

---

### Task 4: Implement typed read-only `objectmgr` client

**Objective:** Convert raw SAC payloads into honest normalized read-only data.

**Files:**
- Create: `src/seams/objectmgr/client.ts`
- Modify: `src/formula/types.ts`
- Test: `tests/contract/objectmgr.readObject.spec.ts`
- Test: `tests/contract/objectmgr.validate.spec.ts`

**Step 1: Write or extend client tests**

Tests should cover:
- building `readObject` request payload for the pilot data action
- building `callFunction(validate)` request payload for the pilot step
- normalizing response bodies without leaking raw SAC junk into the command surface

**Step 2: Implement the smallest client surface**

Allowed methods:
- `readPlanningSequence(...)`
- `validatePlanningSequenceStep(...)`

Not allowed in W1.6:
- generic write/update/save helpers
- list-everything helpers
- contentlib write/edit-lock helpers
- shared “Swiss army knife” SAC client abstraction

**Step 3: Keep CSRF private here unless proven reusable**

If a token is required, resolve it inside this client first.
Do not add a shared `csrf.ts` unless a second client truly needs it.

**Step 4: Run tests**

Run:
```bash
npm run test -- tests/contract/objectmgr.readObject.spec.ts tests/contract/objectmgr.validate.spec.ts
npm run typecheck
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add src/seams/objectmgr/client.ts src/formula/types.ts tests/contract/objectmgr.readObject.spec.ts tests/contract/objectmgr.validate.spec.ts
git commit -m "feat(seams): add typed read-only objectmgr client"
```

---

### Task 5: Replace placeholder `data-action` commands with real read-only output

**Objective:** Make `data-action` stop lying.

**Files:**
- Create: `src/data-action/read.ts`
- Modify: `src/cmd/data-action.ts`
- Modify: `src/cmd/root.ts`
- Create: `tests/data-action/read.spec.ts`
- Modify: `tests/cmd/data-action.spec.ts`
- Modify: `tests/cmd/root.spec.ts`

**Step 1: Write failing tests**

Tests must prove:
- `data-action get` no longer returns `status: "not-implemented"`
- `data-action steps` no longer returns `status: "not-implemented"`
- both commands resolve profile + `pilot/` bundle + `objectmgr` client in the expected order
- stable error envelopes are preserved

**Step 2: Implement bundle-first read services**

`data-action get` should return explicit provenance sections:
- `bundle`: checked-in `pilot/data-action.yaml` facts
- `deployment`: checked-in `pilot/deployment-state.yaml` facts
- `live`: normalized `readObject` facts

Do not flatten those into one lying blob.

`data-action steps` should return:
- ordered step summaries from bundle + live metadata
- proof step clearly marked
- file linkage from `pilot/data-action.yaml`

**Step 3: Run tests**

Run:
```bash
npm run test -- tests/data-action/read.spec.ts tests/cmd/data-action.spec.ts tests/cmd/root.spec.ts
```

Expected:
- PASS

**Step 4: Commit**

```bash
git add src/data-action/read.ts src/cmd/data-action.ts src/cmd/root.ts tests/data-action/read.spec.ts tests/cmd/data-action.spec.ts tests/cmd/root.spec.ts
git commit -m "feat(data-action): replace placeholder commands with read-only output"
```

---

### Task 6: Add real `formula validate` and optionally upgrade `verify-pilot` validation sourcing

**Objective:** Separate validation from readback while improving evidence honesty.

**Files:**
- Create: `src/formula/validate.ts`
- Modify: `src/cmd/formula.ts`
- Modify: `src/formula/verify-pilot.ts`
- Modify: `tests/cmd/formula.spec.ts`
- Create: `tests/formula/validate.spec.ts`
- Modify: `tests/formula/verify-pilot.spec.ts`

**Step 1: Write failing tests**

Tests must prove:
- `formula validate` returns machine-readable validation based on the seam client
- `formula --help` lists `validate`
- `formula verify-pilot` still proves two-pass readback stability
- `formula verify-pilot` prefers seam-backed validation when available
- fallback behavior is explicit if seam-backed validation cannot run

**Step 2: Implement `formula validate`**

Bundle-first behavior:
- read pilot bundle
- resolve profile
- call `objectmgr validate` for the frozen AF source against the known proof step
- return normalized `FormulaValidationResult`

No raw `--file` or `--step-id` flags yet unless adding them makes the implementation simpler **and** still honest.

**Step 3: Upgrade `verify-pilot` carefully**

Keep the browser DOM reopen/readback logic.
Upgrade only the validation source if possible:
- `validationSource: 'objectmgr'` when seam validation succeeds
- `validationSource: 'dom-fallback'` only when the seam cannot run and the fallback is explicitly needed

Do not remove the two-pass stability proof.
That is the whole point of W1.5b.

**Step 4: Run tests**

Run:
```bash
npm run test -- tests/formula/validate.spec.ts tests/cmd/formula.spec.ts tests/formula/verify-pilot.spec.ts
npm run typecheck
```

Expected:
- PASS

**Step 5: Commit**

```bash
git add src/formula/validate.ts src/cmd/formula.ts src/formula/verify-pilot.ts tests/formula/validate.spec.ts tests/cmd/formula.spec.ts tests/formula/verify-pilot.spec.ts
git commit -m "feat(formula): add seam-backed validate and harden verify-pilot"
```

---

### Task 7: Documentation, stale-handover cleanup, and final verification

**Objective:** Make the repo and handoff trail tell the truth.

**Files:**
- Modify: `README.md`
- Modify: `~/.hermes/handoffs/sac-cli-handover-2026-04-16-w1-5.md`
- Optionally modify: `docs/architecture.md`
- Optionally modify: `docs/v0-scope.md` only if wording now misleads future sessions

**Step 1: Update README**

README must say:
- `data-action get` and `data-action steps` are real read-only commands if they landed
- `formula validate` exists if it landed
- `formula verify-pilot` is still non-mutating
- apply/save still do not exist

**Step 2: Patch the stale W1.5 handover**

Add a superseding note at the top of `~/.hermes/handoffs/sac-cli-handover-2026-04-16-w1-5.md` saying:
- W1.5 / W1.5b are no longer next
- `e82903f` landed the verify-pilot lane
- the new next-wave source of truth is this repo-local W1.6 plan

Do not leave future sessions thinking W1.5 is still next. That is how dumb loops start.

**Step 3: Run full repo verification**

Run:
```bash
npm run test
npm run typecheck
npm run build
npm run test:contract
npm run test:live
npm run cli -- --json doctor pilot
```

Expected:
- `test`, `typecheck`, `build`, `doctor pilot` pass
- `test:contract` passes with real contract tests now present
- `test:live` may still pass with no tests; that is informational, not substantive W1.6 evidence

**Step 4: Optional human/live smoke**

Only if a real profile exists locally, and run from repo root or include `--root` explicitly:

```bash
npm run cli -- --json --profile <name> data-action get --root .
npm run cli -- --json --profile <name> data-action steps --root .
npm run cli -- --json --profile <name> formula validate --root .
npm run cli -- --json --profile <name> formula verify-pilot --root .
```

Acceptance for optional live smoke:
- read-only commands return stable envelopes
- no save/apply side effects occur
- evidence output remains local and uncommitted

**Step 5: Commit**

```bash
git add README.md docs/architecture.md docs/v0-scope.md
git commit -m "docs: update repo truth for w1.6 read-only spine"
```

---

## Acceptance criteria

W1.6 is done only if all of these are true:

1. `data-action get` no longer returns `status: "not-implemented"` and returns the explicit `bundle`, `deployment`, and `live` sections described above.
2. `data-action steps` no longer returns `status: "not-implemented"` and returns ordered normalized step summaries with the proof step marked.
3. `formula --help` lists `validate`, and `formula validate` returns a normalized `FormulaValidationResult` envelope.
4. `tests/contract/objectmgr.readObject.spec.ts` exists and passes.
5. `tests/contract/objectmgr.validate.spec.ts` exists and passes.
6. `npm run test:contract` passes **after** those contract tests exist.
7. page-context fetch helper is covered by `tests/session/page-fetch.spec.ts` and passes.
8. `formula verify-pilot` still proves two-pass stable readback hashes.
9. no new CLI commands/subcommands named `apply`, `save`, or `update` are added.
10. no `startEdit`, `stopEdit`, `save`, `update`, or `publish` seam calls are introduced.
11. README and the stale W1.5 handover both point future sessions at the correct next-wave truth.

---

## Risks and how to handle them

### Risk 1: `objectmgr.validate` payload shape is more coupled than expected
Response:
- keep W1.6 pilot-bundle-centric
- build only for the proven pilot step first
- do not generalize early

### Risk 2: transport helper turns into a hidden browser framework
Response:
- keep it tiny
- only support what the W1.6 `objectmgr` client needs
- refuse scope creep into generic automation utilities

### Risk 3: validation seam cannot fully replace DOM-derived validation
Response:
- keep DOM validation only as explicit fallback
- record the source of validation in evidence/output
- do not pretend both paths are equivalent

### Risk 4: docs go stale again
Response:
- patch README in the same wave
- patch the stale handover in the same wave
- do not leave the new plan untracked or local-only if it becomes the next source of truth

---

## Blunt sequencing rule after W1.6

If W1.6 lands cleanly, **then** we can talk about W1.7.
But W1.7 should still be a narrow proof built on real seam evidence — not a fantasy “full SAC CLI.”

If W1.6 does **not** land cleanly, do not open an apply/save lane. That would be dumb.

---

## Suggested next-session opener

```text
Continue sac-cli from docs/plans/2026-04-16-w1-6-read-only-seam-spine.md.
Implement W1.6 only: add the data-action command module, extract shared formula validation types, check in redacted objectmgr fixtures, add the page-context fetch helper, add the typed read-only objectmgr client, replace placeholder data-action commands, add formula validate, and keep verify-pilot non-mutating.
Do not add apply/save.
```
