# Pilot bundle

This folder freezes the week-1 proof inputs and pilot artifacts for the narrow SAC wedge:
- one planning story/table target
- one data action target
- one Advanced Formula step source file
- one deployment-state map
- one evidence contract

Guardrails:
- `steps/*.af` is the only code-like source of truth here.
- `deployment-state.yaml` stores observed SAC identifiers, not desired behavior.
- `evidence/manifest.yaml` is mandatory proof contract, not optional documentation.
- `sourceStatus: ui-preview-excerpt` means the AF file is seeded from a live editor capture, not yet from a proven read-back pull.
