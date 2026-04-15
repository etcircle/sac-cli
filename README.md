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
- root scripts for `build`, `typecheck`, `test`, `test:contract`, `test:live`, and `cli`

What does not exist yet:
- real SAC auth/bootstrap smoke on the live tenant
- page-context transport
- seam clients
- formula validation/read-back execution
- evidence capture runtime

## Commands

```bash
npm run cli -- --help
npm run cli -- --json doctor session
npm run cli -- --json doctor pilot
```

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
