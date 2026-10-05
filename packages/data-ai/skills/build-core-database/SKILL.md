---
name: build-core-database
description: Build a feature's ECS schema (ecs/core) and its conformance wiring. The first ecs layer.
input: feature
output: feature
---

Create:

- `ecs/core/archetypes.ts` — `Database.archetypes(components, { … })`, spreading each
  `data/entities` tuple and adding implementation-only columns (never a
  `nonPersistent` column without a real default).
- `ecs/core/core-database.ts` — `Database.Plugin.create({ extends?, components?,
  resources?, archetypes? })` from the `data/` barrels, exporting the `CoreDatabase`
  namespace. A feature built on another extends that feature's core.
- `ecs/main-service.ts` — `export { CoreDatabase as MainService }`, moved up as layers
  are added.
- `ecs/conformance/` — `projection.ts`, `implementation.ts`
  (`Conformance.implementation(spec, …)`) and `conformance.test.ts`
  (`Conformance.checkFeature`).

Gate: the samples round-trip through the projection. Until the later layers exist,
`checkFeature` lists each spec op without an implementation by name; that list is
the work remaining.

The how is in the auto-loading `features/ecs/index.md`, `core.md` and `conformance.md`
rules.
