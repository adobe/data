---
name: build-service-database
description: Build a feature's ecs service-database — db-bound service factories. If the feature exposes services.
---

Create `ecs/service-database/`: `service-database.ts` (extends the previous layer, registers the
`services` facet). Two forms:

- db-bound factories `create<Name>Service(db, …)` in `service-database/services/` (one per file + barrel), for services that read `db.observe.*` / call `db.transactions.*`; or
- plain async ports registered straight from the feature's `services/` contracts.

Comes after `computed-database`.

The how is in the auto-loading `features/ecs/services.md` rule.
