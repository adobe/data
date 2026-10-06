---
name: build-service-database
description: Build a feature's ecs/services layer — registering services on the database. Optional.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Skip if the feature has no services.

Create `ecs/services/service-database.ts` (extends the previous layer), registering
each `services/` service's `create` under its `Services` key, plus any database-bound
factories (one per file + barrel) for services that read observables or call
transactions. Pin with `Assert<Equal<ServiceDatabase["services"], Services>>`. Give
the implementation base fakes for services whose `create` throws.

The how is in the auto-loading `features/ecs/services.md` rule.
