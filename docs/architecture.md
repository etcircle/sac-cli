# sac-cli architecture

This repo follows the week-1 source of truth:
- parent owns the control-plane and contract-critical spine first
- browser-backed auth/session is the future runtime substrate
- proven SAC seams stay read-only first
- evidence-driven verification is mandatory before mutation work

Planned internal split:
- control plane
- execution plane
- proof plane
