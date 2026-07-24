---
name: build-core-database
description: Build a feature's ecs schema — the core-database (components, resources, archetypes). The first ecs layer.
input: feature
output: feature
---

Create `ecs/core-database/` — `core-database.ts` plus one single-export file per facet
the feature actually uses (`components`, `resources`, `archetypes` are each optional on
`Database.Plugin.create`). Create only the facet files you need; omit the rest rather than
shipping empty `Database.components({})` boilerplate. A feature with **no entities** (a
singleton whose whole state is resources) is just `resources.ts` + `core-database.ts`.

- `components.ts` → `Database.components({ document, settings, presence, session })` (scopes optional) — only if the feature has entities.
- `resources.ts` → `Database.resources({ … })` (every entry needs a `default`) — for singleton / global state.
- `archetypes.ts` → `Database.archetypes(components, { … })` — only alongside components.
- `core-database.ts` → `Database.Plugin.create({ imports?, components?, resources?, archetypes? })`, exporting the `CoreDatabase` namespace.

The schema root; comes after `data/` (and `services/`). Bind each schema from its `data/`
type — don't author shapes here. Components use JSON schemas; resources use the
`{ default }` convention (a schemaless aggregate binds via `{ default: State.create() }`).

The how is in the auto-loading `features/ecs/index.md` + `components.md` / `resources.md` /
`archetypes.md` rules.
