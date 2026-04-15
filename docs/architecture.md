# sac-cli architecture

This repo follows the week-1 source of truth:
- parent owns the control-plane and contract-critical spine first
- browser-backed auth/session is the future runtime substrate
- proven SAC seams stay read-only first
- evidence-driven verification is mandatory before mutation work
- the `pilot/` bundle is the frozen proof contract for week-1 work

Current internal split:
- control plane
- execution plane
- proof plane

Week-1 proof plane contract:
- `proof-inputs.yaml` binds the live target story/data action/step identifiers
- `data-action.yaml` + `steps/*.af` carry the intended AF-facing source bundle
- `story.yaml` + `widgets/*.yaml` freeze the minimal planning table surface
- `deployment-state.yaml` stores observed SAC identities separately from intent
- `evidence/manifest.yaml` defines mandatory read-back and verification artifacts
