# Attach-First Existing Browser Mode Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Parent owns final integration, browser smoke, and merge verdict.

**Goal:** Add an attach-first browser mode to `sac-cli` so story/table commands can reuse an already-authenticated Chrome process/tab context instead of launching and owning a fresh persistent browser session.

**Architecture:** Keep the existing Playwright-backed session model, but split session acquisition into two transports: **owned persistent context** and **attached CDP browser**. For attached mode, always create a fresh page in the already-running browser and close only that page at the end of the command. Keep SAC API calls for readback/proof; do **not** expand `contentlib.updateContent` work in this wave.

**Tech Stack:** TypeScript, `playwright-core`, Commander, Zod, Vitest.

---

## Why this wave exists

GPT Pro’s useful recommendation was blunt and correct:
- the SAC product outcome is already proven live
- the generic member-selector logic is no longer the main problem
- `contentlib.updateContent` is not a sane primary mutation lane right now
- the next honest move is **attach-first control of the existing authenticated browser**

The current code still behaves like a browser-session owner:
- `configureStoryTableFromPilot()` resolves a session factory and calls it directly: `src/story/configure-table.ts:787-791`
- the command unconditionally closes that session in `finally`: `src/story/configure-table.ts:841-846`
- `launchPersistentBrowserSession()` always launches a new persistent context and closes the whole context: `src/session/browser-session.ts:175-201`
- story commands describe “one managed SAC session per command”: `src/cmd/story.ts:135-137`

That is the seam we need to change.

---

## Non-goals for this wave

Do **not** do any of this in the first implementation session:
- no new `contentlib.updateContent` save-contract archaeology
- no headless widget/browser harness redesign
- no browser-login automation work
- no global auth/SSO refactor
- no broad new command surface outside the story/table lane

This wave is strictly about: **attach to an existing authenticated browser and use that as the canonical mutation path**.

---

## Parent-owned execution rules

These rules apply to every delegated task:
1. No child creates or depends on SAC creds in repo files.
2. No child broadens scope into API-first mutation work.
3. Parent verifies all targeted tests after each task.
4. Parent runs one real browser smoke at the end using the cloned debug Chrome (`9333`) or whatever live debug port exists then.
5. Parent is the only one who decides whether to keep or kill the attached debug Chrome.

---

## Task 1: Lock the attach-session contract in tests first

**Objective:** Define the browser-session behavior we actually want before editing the session layer.

**Files:**
- Modify: `tests/session/browser-session.spec.ts`
- Modify: `src/session/browser-session.ts`

**What to prove in tests:**
1. We can attach over CDP when a debug URL is available.
2. Attached mode creates a **fresh page** in the existing browser context.
3. Closing an attached session closes only the owned page, **not** the whole browser/context.
4. `attach-only` mode fails clearly if the debug URL is missing or CDP attach fails.
5. Existing launch behavior still works unchanged.

**Step 1: Write failing tests**

Add cases in `tests/session/browser-session.spec.ts` for a new attach path. Use a mocked runtime shaped like this:

```ts
const browserClose = vi.fn().mockResolvedValue(undefined);
const attachedPageClose = vi.fn().mockResolvedValue(undefined);
const attachedPage = {
  close: attachedPageClose,
  screenshot: vi.fn(),
  goto: vi.fn(),
  url: () => 'about:blank'
};
const attachedContext = {
  pages: () => [],
  newPage: vi.fn().mockResolvedValue(attachedPage),
  close: vi.fn().mockResolvedValue(undefined)
};
const connectOverCDP = vi.fn().mockResolvedValue({
  contexts: () => [attachedContext],
  close: browserClose
});
```

Add a test expectation like:

```ts
expect(connectOverCDP).toHaveBeenCalledWith('http://127.0.0.1:9333');
expect(session.page).toBe(attachedPage);
await session.close();
expect(attachedPageClose).toHaveBeenCalled();
expect(attachedContext.close).not.toHaveBeenCalled();
expect(browserClose).not.toHaveBeenCalled();
```

Also add a failure test for no-context / missing-debug-url with a crisp error code like `BROWSER_ATTACH_UNAVAILABLE` or `BROWSER_ATTACH_CONTEXT_MISSING`.

**Step 2: Run the narrow tests to verify failure**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts
```

Expected: FAIL on missing attach API / missing attach helper.

**Step 3: Implement the minimal session-layer contract**

In `src/session/browser-session.ts`:
- extend `BrowserRuntime` so `chromium` can also `connectOverCDP(endpoint: string)`
- add optional `close(): Promise<void>` to `BrowserPage`
- add a new attach helper, for example:

```ts
export type BrowserAttachMode = 'launch' | 'attach-first' | 'attach-only';

export async function attachToBrowserSession(
  profile: Pick<SacCliProfile, 'browserChannel' | 'name' | 'tenantUrl'> & {
    remoteDebuggingUrl: string;
  },
  runtime: BrowserRuntime
): Promise<ManagedBrowserSession> {
  // connectOverCDP
  // pick first context
  // create fresh page
  // close() only closes the fresh page
}
```

Also update `createDefaultBrowserRuntime()` to expose:

```ts
connectOverCDP: playwright.chromium.connectOverCDP.bind(playwright.chromium)
```

**Step 4: Re-run the tests**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts
```

Expected: PASS.

**Step 5: Spec review subagent**

Review question:
- does the session layer now distinguish launch-owned vs attach-owned lifecycle correctly?
- does attached close avoid killing the whole browser?

**Step 6: Code-quality review subagent**

Review question:
- are attach errors crisp and non-misleading?
- does the attached session own only the new page?

---

## Task 2: Add minimal profile/CLI contract for attach mode

**Objective:** Make attach mode configurable without forcing repo edits or global refactors.

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/profile-store.ts`
- Modify: `src/cmd/story.ts`
- Modify: `tests/cmd/story.spec.ts`

**Design choice:** keep this minimal and honest.

Add optional profile fields:
```ts
remoteDebuggingUrl?: string;
browserAttachMode?: 'launch' | 'attach-first' | 'attach-only';
```

Add story-command overrides:
- `--browser-debug-url <url>`
- `--attach-mode <launch|attach-first|attach-only>`

Reason:
- local profiles can remember the normal attach target
- the next session can still override with a temporary port like `9333`
- `attach-only` gives us the honest “do not launch a fresh browser” safety rail

**Step 1: Write failing CLI tests**

In `tests/cmd/story.spec.ts`, add coverage that verifies the story service receives these new fields when passed:

```ts
expect(configureTable).toHaveBeenCalledWith({
  projectRoot: '/tmp/project',
  profileName: 'pilot-sandbox',
  browserDebugUrl: 'http://127.0.0.1:9333',
  attachMode: 'attach-only'
});
```

Also add one help-output assertion that the new options show up under:
- `story configure-table --help`
- `story table configure --help`

**Step 2: Run tests to verify failure**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/cmd/story.spec.ts
```

Expected: FAIL because the options/fields do not exist yet.

**Step 3: Implement minimal plumbing**

In `src/config/schema.ts`:
- extend `profileSchema` with the two optional fields

In `src/cmd/story.ts`:
- extend `StoryBaseOptions`
- extend `resolveBaseInput()`
- register the two new options in `applyStoryTargetOptions()`

Keep the CLI surface story-only for now. Do **not** add new root/global flags in this wave.

**Step 4: Re-run the tests**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/cmd/story.spec.ts
```

Expected: PASS.

**Step 5: Spec review subagent**

Review question:
- is the CLI/profile contract minimal, explicit, and sufficient for next-session use?
- did we avoid broadening scope beyond the story lane?

**Step 6: Code-quality review subagent**

Review question:
- are option names clear and hard to misuse?
- do defaults preserve current behavior when no attach info is provided?

---

## Task 3: Switch story commands from session-owning to attach-aware acquisition

**Objective:** Make story/table commands acquire the browser session via one helper that supports both launch and attach modes, with attach-first as the preferred live path.

**Files:**
- Modify: `src/story/configure-table.ts`
- Modify: `src/session/browser-session.ts`
- Modify: `tests/story/configure-table.spec.ts` (only if needed for type/contract coverage)
- Modify: `tests/session/browser-session.spec.ts`

**Required behavior:**
1. `launch` preserves current behavior.
2. `attach-first` tries CDP first when a debug URL is available, then falls back to launch.
3. `attach-only` fails clearly instead of launching a new browser.
4. `session.close()` remains safe for both owned and attached sessions.

**Step 1: Extend story input/deps contract**

In `src/story/configure-table.ts`, extend `ConfigureStoryTableInput` with:

```ts
browserDebugUrl?: string;
attachMode?: 'launch' | 'attach-first' | 'attach-only';
```

**Step 2: Add one acquisition helper**

In `src/session/browser-session.ts`, add something like:

```ts
export async function openManagedBrowserSession(
  profile: SacCliProfile,
  runtime: BrowserRuntime,
  options?: {
    attachMode?: BrowserAttachMode;
    browserDebugUrl?: string;
  }
): Promise<ManagedBrowserSession>
```

Behavior:
- resolve effective mode from CLI override, then profile, else default to `launch`
- resolve effective debug URL from CLI override, then profile
- if `attach-first`, try attach then fall back to launch
- if `attach-only`, require a debug URL and never launch

**Step 3: Replace direct launch path**

In `configureStoryTableFromPilot()` replace the current session factory default path with the new attach-aware acquisition helper.

Current seam to replace:
- `src/story/configure-table.ts:787-790`

Do **not** disturb the table-builder workflow logic in this task. Only change session acquisition.

**Step 4: Add focused tests**

At minimum add coverage for:
- attach-first chooses CDP when available
- attach-only errors instead of launching
- launch mode still launches persistent context

**Step 5: Run targeted tests**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts
```

Expected: PASS.

**Step 6: Spec review subagent**

Review question:
- did we change only session acquisition, not story/table semantics?
- does `attach-only` enforce the “no fresh session churn” rule?

**Step 7: Code-quality review subagent**

Review question:
- is the launch/attach branching easy to reason about?
- are failure modes honest and actionable?

---

## Task 4: Harden errors and evidence for live attach debugging

**Objective:** Make failures obvious when attach is unavailable, instead of silently drifting into login or launch confusion.

**Files:**
- Modify: `src/session/browser-session.ts`
- Modify: `src/story/configure-table.ts`
- Modify: `tests/session/browser-session.spec.ts`

**Required behavior:**
- missing debug URL + `attach-only` → explicit error
- CDP connect refused in `attach-only` → explicit attach failure, no launch fallback
- CDP attach succeeds but yields no browser contexts/pages → explicit error
- evidence/body preview should still be captured when story logic fails after attach succeeded

**Step 1: Add failing tests for attach-specific error paths**

Use mocked `connectOverCDP` failures such as rejected promises or empty `contexts()`.

**Step 2: Implement crisp errors**

Prefer dedicated error codes like:
- `BROWSER_ATTACH_REQUIRED`
- `BROWSER_ATTACH_FAILED`
- `BROWSER_ATTACH_CONTEXT_MISSING`

Do **not** reuse `INTERACTIVE_LOGIN_REQUIRED` for attach failures. That would be bullshit and will waste time next session.

**Step 3: Run targeted tests**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts
```

Expected: PASS.

**Step 4: Review**

Spec review:
- do attach failures now clearly distinguish browser-control problems from SAC auth problems?

Quality review:
- are the error names/messages specific enough for live troubleshooting?

---

## Task 5: Parent-owned integration and live proof lane

**Objective:** Verify the new attach-first path end-to-end without reopening the `updateContent` rabbit hole.

**Files:**
- No new code required beyond prior tasks
- Update docs only if verification reveals missing operational instructions

**Step 1: Run focused repo checks**

Run:
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts
npm run build
```

Expected:
- targeted tests pass
- build passes

**Step 2: Run the real attach-only smoke**

Use the live cloned debug browser session, not a fresh browser launch.

Example command shape:
```bash
cd ~/dev-workspaces/sac-cli
npm run cli -- --json --profile decisioninc-live story table configure \
  --root . \
  --attach-mode attach-only \
  --browser-debug-url http://127.0.0.1:9333
```

Success condition for this wave:
- command reaches the existing authenticated browser through CDP attach
- opens/uses a fresh page in that browser
- does **not** launch a fresh persistent session
- if table interaction still fails later, the failure is now inside story logic, not browser attachment

**Step 3: Record verdict**

If the smoke succeeds, update the relevant handoff/plan doc with:
- exact port/debug URL used
- exact command used
- whether a new tab was created and safely closed
- whether SAC remained authenticated

If the smoke fails, record the exact attach error and stop. Do **not** pivot into `contentlib.updateContent` work in the same session.

---

## Task 6: Immediate follow-on plan gate (only after Task 5 passes)

**Objective:** Define the next session’s implementation target after attach-first is proven.

**Likely next step if attach works:**
- rerun the story/table lane against the existing authenticated browser
- focus on any remaining UI interaction failures in the live tab/page
- keep API calls as readback/proof only

**Likely next step if attach does not work:**
- narrow to the exact CDP/profile/debug-port failure
- do not touch SAC table logic until browser control is real

This is a decision gate, not a broad new build task.

---

## Delegation map

### Safe to delegate
- Task 1: session-layer attach tests + minimal attach helper
- Task 2: profile/CLI plumbing
- Task 3: story acquisition refactor
- Task 4: attach-specific error hardening

### Parent-owned
- live browser smoke against the real debug Chrome
- final scope policing
- final verdict on whether to proceed to story interaction work

### Review structure for every delegated task
1. **Implementer subagent** — exact task only
2. **Spec-compliance reviewer** — did it match this plan and avoid scope creep?
3. **Code-quality reviewer** — are errors/tests/contracts sane?
4. **Parent reruns targeted tests** before marking the task done

---

## Validation commands

### Per-task targeted proof
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts
npm run test -- tests/cmd/story.spec.ts
npm run test -- tests/story/configure-table.spec.ts
```

### Combined narrow proof
```bash
cd ~/dev-workspaces/sac-cli
npm run test -- tests/session/browser-session.spec.ts tests/cmd/story.spec.ts tests/story/configure-table.spec.ts
```

### Broader sanity check before ending the session
```bash
cd ~/dev-workspaces/sac-cli
npm run build
```

### Live proof command
```bash
cd ~/dev-workspaces/sac-cli
npm run cli -- --json --profile decisioninc-live story table configure \
  --root . \
  --attach-mode attach-only \
  --browser-debug-url http://127.0.0.1:9333
```

---

## Risks / trade-offs

### Good trade
- We align the code with the proven user workflow: reuse the authenticated browser, don’t relogin, don’t churn contexts.

### Acceptable trade
- We add a small amount of transport/config complexity (`launch` vs `attach-*`) to avoid a far worse product lie.

### Bad trade to avoid
- Overbuilding a whole browser-management subsystem in this wave.
- Hiding attach failure behind launch fallback when the user explicitly wanted no fresh session churn.
- Treating `contentlib.updateContent` as a parallel write lane before attach is proven.

---

## Done means

This plan is complete only when all of the following are true:
1. story/table commands can run with `--attach-mode attach-only`
2. they can connect to an existing Chrome debug session via CDP
3. they create/own only a fresh page, not the whole browser
4. they do not silently launch a fresh persistent session in `attach-only`
5. targeted tests pass
6. the real smoke command reaches SAC through the existing authenticated browser session

If those are not true, the wave is not done.
