---
name: build-actions
description: Build a feature's ecs/actions layer — the operations the app performs.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Create `ecs/actions/`: `action-database.ts` (extends the previous layer, adds `actions`
from `./index.js`), one action per file, and a barrel. Every spec action has a
same-named action. It awaits services and commits through at most one transaction
(add any transaction `build-transactions` missed). Point `ecs/main-service.ts` at the top layer.

Gate: `checkFeature` passes for each op as it is added.

The how is in the auto-loading `features/ecs/actions.md` rule.
