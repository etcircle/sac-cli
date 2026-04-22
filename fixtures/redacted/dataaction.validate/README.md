# `dataaction.validate` redacted fixtures

This folder freezes the honest baseline for the `dataaction.validate` capability.

## What is here
- `capture.json` — redacted browser workflow capture envelope for the winning `objectmgr validate` request/response
- `registry-entry.yaml` — semantic capability registry entry wired to repo-local tests and docs

## Blunt rule
Do **not** replace this with a hand-minimized synthetic payload and call it equivalent.

Live proof in W1.6 showed that minimal synthetic `objectmgr validate` bodies were unreliable. The working baseline is:
1. capture the browser request that actually validated in SAC
2. preserve the surrounding payload shape
3. surgically patch only the target step `scriptContent`

## Redaction notes
- tenant description and other identifying values are removed or replaced
- the payload shape, prompt structure, sibling-step metadata, and validation response layout are intentionally preserved

## Non-claims
- This fixture does **not** prove data-action save/apply.
- This fixture does **not** claim generic story creation/update is solved.
