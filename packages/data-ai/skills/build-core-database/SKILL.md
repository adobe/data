---
name: build-core-database
description: Build a feature's ecs schema — the core-database (components, resources, archetypes). The first ecs layer.
input: feature
output: feature
---

Create `ecs/core-database/` — four single-export files:

- `components.ts` → `Database.components({ document, settings, presence, session })` (scopes optional)
- `resources.ts` → `Database.resources({ … })` (every entry needs a `default`)
- `archetypes.ts` → `Database.archetypes(components, { … })`
- `core-database.ts` → `Database.Plugin.create({ imports?, components, resources, archetypes })`, exporting the `CoreDatabase` namespace.

The schema root; comes after `data/` (and `services/`). Bind each schema from its `data/`
type — don't author shapes here.

The how is in the auto-loading `features/ecs/index.md` + `components.md` / `resources.md` /
`archetypes.md` rules.
