---
name: build-actions
description: Build a feature's ecs action-database — async orchestration over services and transactions. If the feature has async flows.
---

Create `ecs/action-database/`: `action-database.ts` (extends `ServiceDatabase`, adds `actions`
from `./actions/index.js`) plus an `actions/` folder — one async orchestrator per file. An action
takes `db: ServiceDatabase`, awaits `services/` ports, then commits **exactly one** transaction.

The top ecs layer; comes after `service-database`.

The how is in the auto-loading `features/ecs/actions.md` rule.
