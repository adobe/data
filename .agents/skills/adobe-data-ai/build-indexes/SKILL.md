---
name: build-indexes
description: Build a feature's ecs index-database — component/archetype indexes for O(1) lookup. As needed.
input: feature
output: feature
---

Create `ecs/index-database/`: `index-database.ts` (extends `CoreDatabase`, adds the `indexes`
facet from `./indexes/index.js`) plus an `indexes/` folder — one index per file + an `index.ts`
barrel.

Only if the feature needs indexed lookups. Comes after `core-database`.

The how is in the auto-loading `features/ecs/indexes.md` rule.
