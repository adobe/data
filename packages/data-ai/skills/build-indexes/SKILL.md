---
name: build-indexes
description: Build a feature's ecs/indexes layer. Optional.
input: feature
output: feature
---

Legacy feature (has `data/state/` or `services/main-service/`)? Extend it in place per the legacy rules; don't migrate unless asked.

Skip if the feature needs no indexed lookups.

Create `ecs/indexes/`: `index-database.ts` (extends `CoreDatabase`, adds `indexes` from
`./index.js`), one index per file, and an `index.ts` barrel.

Gate: conformance unchanged, plus index tests where an index has logic.

The how is in the auto-loading `features/ecs/indexes.md` rule.
