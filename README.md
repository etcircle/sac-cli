# sac-cli

CLI-first SAC authoring/runtime proof tool.

Current status: week-1 control-plane + auth spine + frozen pilot bundle.

What exists right now:
- TypeScript CLI skeleton
- root command families for `auth`, `data-action`, `formula`, and minimal `doctor`
- stable JSON/plain output helpers
- command-family allowlist guard via `--enable-commands`
- profile-backed headed auth bootstrap with persistent browser contexts
- frozen `pilot/` bundle for proof inputs, artifact manifests, and evidence contract
- `doctor pilot` validation with deterministic bundle fingerprints
- read-only `objectmgr` seam helpers for the frozen pilot lane
- real `data-action get` / `data-action steps` bundle-first commands with explicit `bundle` / `deployment` / `live` output sections
- real `formula validate` for the frozen pilot step via `objectmgr`
- `formula verify-pilot` for a two-pass AF readback proof against the frozen pilot bundle with no save/apply calls implemented in this repo
- root scripts for `build`, `typecheck`, `test`, `test:contract`, `test:live`, and `cli`

What does not exist yet:
- real SAC auth/bootstrap smoke on the live tenant
- mutation/apply/save flows
- broad SAC discovery or write surfaces beyond the frozen pilot lane

Current source-of-truth docs:
- `docs/plans/2026-04-16-w1-7-v2-seam-harvest-program.md` — the current W1.7 / V2 program plan for scaling seam discovery and capability promotion
- `docs/handoffs/2026-04-16-sac-cli-w1-7-v2-handover.md` — the next-session continuation brief with live proof outcomes and immediate starting points
- `docs/plans/2026-04-16-w1-6-read-only-seam-spine.md` — historical W1.6 implementation plan that grounded the current read-only `objectmgr` spine

## Commands

```bash
npm run cli -- --help
npm run cli -- --json doctor session
npm run cli -- --json doctor pilot
npm run cli -- --json --profile <name> data-action get --root .
npm run cli -- --json --profile <name> data-action steps --root .
npm run cli -- --json --profile <name> formula validate --root .
npm run cli -- --json --profile <name> formula verify-pilot --root .
npm run cli -- --json --profile <name> story table inspect-menu --root .
npm run cli -- --json --profile <name> story table inspect-cell-menu --root .
npm run cli -- --json --profile <name> story table inspect-gates --root .
```

Do not commit evidence output from real runs. `formula verify-pilot` writes local artifacts that can include your resolved tenant URL and target route details.

## Pilot bundle

`pilot/` freezes the week-1 proof inputs and artifacts:
- `proof-inputs.yaml`
- `data-action.yaml`
- `steps/*.af`
- `story.yaml`
- `widgets/*.yaml`
- `deployment-state.yaml`
- `evidence/manifest.yaml`

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```
