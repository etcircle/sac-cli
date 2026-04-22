# SAC CLI Handover — 2026-04-16 — W1.7 / V2 Continuation

## What landed on `main`

Remote `origin/main` now includes:
- `e82903f` — `feat: add pilot AF verify proof lane`
- `4fe7634` — `feat: add w1.6 read-only objectmgr spine`
- `9d7af36` — `fix: resolve live objectmgr runtime context`
- `027ca93` — `fix: reuse live validate payload for formula validation`

Repo state at handoff time:
- branch: `main`
- remote HEAD == local HEAD
- only untracked file intentionally left out: `.cgcignore`

## What was proven live

### 1. Auth/bootstrap is real
- profile: `decisioninc-live`
- tenant URL: `https://decisioninc-1.eu10.hcs.cloud.sap/sap/fpa/ui/app.html`
- `auth status` = ok

### 2. Read-only `objectmgr` spine is real
Live commands now work:
- `data-action get`
- `data-action steps`
- `formula validate`

### 3. Advanced Formula validation required captured-payload replay
Blunt truth:
- minimal synthetic `objectmgr validate` payloads produced garbage results or 500s
- captured browser payload + surgical patch of the target step `scriptContent` produced the honest live result

Current live `formula validate` result:
- `UPDATED_OTHER_MODEL: C_RATES`

That is the real semantic error, not a transport/auth/prompt-resolution failure.

### 4. Browser story save is real in a non-public artifact
Story:
- `POC - C_REPORTING forecast table`
- folder: `My Files / My Playground`
- story resource id: `6441DE864495C73F5BCA84DEF179F641`

Proved flow:
- edited page title in the story editor
- used `Meta+S`
- reloaded same route
- change persisted

Current original story page title after cleanup:
- `Page_1 proof 20260416-220511`

Screenshot captured earlier:
- `/tmp/sac-story-playground-proof-20260416-220511.png`

### 5. Internal API story duplication is real
Proved seam:
- `POST /sap/fpa/services/rest/epm/contentlib?tenant=J`
- action: `copyResource`

Working copy result:
- source story id: `6441DE864495C73F5BCA84DEF179F641`
- copied to: `PRIVATE_ETANEV` (My Files root)
- duplicate story id: `7521F68644935B2C5871537B15391578`

Important behavior:
- copying to `My Playground` with the same name fails with:
  - `RESOURCE_SAME_NAME_EXIST_IN_SAME_FOLDER`
- several obvious rename-on-copy payload variants did **not** produce a renamed duplicate

### 6. API story creation/rename is not productized yet
Tried and failed:
- `contentlib.createContent` using `getContent` payload → `DASHBOARD_CONTENT_INVALID_ENTITIES` / `DASHBOARD_CONTENT_INVALID`
- `contentlib.updateContent` on copied story using captured update payload → `DASHBOARD_CONTENT_INVALID`

Interpretation:
- story copy seam is real
- generic story create/update still depends on hidden content semantics we have not captured cleanly
- do not pretend we have general story creation yet

### 7. API-created duplicate + browser rename proof succeeded
Duplicate route:
- `#/story2&/s2/7521F68644935B2C5871537B15391578/?type=CANVAS&mode=edit`

Duplicate page title after save + reload:
- `Page_1 API duplicate 20260416-222954`

Important caveat:
- story title/name at the top still appears as `POC - C_REPORTING forecast table`
- only the **page title** was changed and proven persistent

Screenshot captured:
- `/tmp/sac-story-api-duplicate-proof-20260416-222954.png`

## Key strategic conclusion

We should scale by **workflow capture → seam extraction → contract hardening → capability promotion**, not by dumping random internal endpoints into notes.

Today’s strongest examples:
- `dataaction.validate` = captured payload + surgical patch
- `story.copy` = internal API seam
- `story.save-page-title` = browser-backed mutation proof

## New docs created in repo

### Current program plan
- `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md`

### Repo-local handoff
- `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md`

These should be treated as the main next-session briefing artifacts.

## Recommended next-session start order

1. Read:
   - `README.md`
   - `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md`
   - `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md`

2. Verify repo/runtime baseline:
   ```bash
   git status --short
   npm run test
   npm run test:contract
   npm run typecheck
   npm run build
   npm run cli -- --json --profile decisioninc-live formula validate --root .
   ```

3. Start W1.7 with the seam-harvest foundation, not another ad-hoc capability:
   - capture artifact schema
   - capability registry schema
   - replay/diff tooling

4. Promote first capabilities in this order:
   - `story.copy`
   - `story.save-page-title`
   - `dataaction.validate`

## Specific IDs and paths worth keeping handy

### Profiles / folders / stories
- profile: `decisioninc-live`
- My Files root folder id: `PRIVATE_ETANEV`
- My Playground folder id: `14585305A63F4276711720ECE92C7874`
- original story id: `6441DE864495C73F5BCA84DEF179F641`
- duplicate story id: `7521F68644935B2C5871537B15391578`

### Local artifacts
- captured story update payload: `/tmp/sac-story-update-request-20260416-222954.json`
- screenshot: `/tmp/sac-story-playground-proof-20260416-220511.png`
- screenshot: `/tmp/sac-story-api-duplicate-proof-20260416-222954.png`

## Things not to forget

- `copyResource` works, but same-folder duplication with same name collides immediately
- `createContent` is still not honest for stories
- `updateContent` replay on a copied story is still invalid with the captured payload we have
- browser keyboard save (`Meta+S`) is a legitimate proof lane and should stay in the toolkit
- for delicate SAC APIs, assume exact browser payload replay is the baseline until proven otherwise

## The blunt next question

The next session should not ask “what endpoint next?”
It should ask:
- how do we capture workflows systematically?
- how do we diff payloads safely?
- how do we promote seams into capability docs/tests without lying?

That is what W1.7 / V2 is for.