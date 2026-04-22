# Capability registry notes

This folder documents semantic SAC capabilities, not raw endpoints.

## Current seeded entries
- `dataaction.validate` — *promoted*, hybrid browser + internal API seam, backed by captured-payload replay

## Rules
1. Use semantic names like `dataaction.validate`, not endpoint-shaped labels.
2. Treat browser capture as source truth for delicate authoring seams until replay experiments prove otherwise.
3. Keep docs blunt about what is and is not productized.

## Non-claims in this wave
- Generic story create/update and data-action save/apply are still unproven here.
