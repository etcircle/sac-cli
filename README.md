# sac-cli

CLI-first SAC authoring/runtime proof tool.

Current status: W1.1 parent-owned control-plane scaffold only.

What exists right now:
- TypeScript CLI skeleton
- root command families for `auth`, `data-action`, `formula`, and minimal `doctor`
- stable JSON/plain output helpers
- command-family allowlist guard via `--enable-commands`
- root scripts for `build`, `typecheck`, `test`, `test:contract`, `test:live`, and `cli`

What does not exist yet:
- real SAC auth/bootstrap
- page-context transport
- seam clients
- formula validation/read-back
- evidence pipeline

## Commands

```bash
npm run cli -- --help
npm run cli -- --json doctor session
```

## Development

```bash
npm install
npm run typecheck
npm run test
npm run build
```
