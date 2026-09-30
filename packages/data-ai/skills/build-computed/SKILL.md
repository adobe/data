---
name: build-computed
description: Build a feature's ecs/computed layer. Optional.
input: feature
output: feature
---

Skip if the spec has no derivations and the UI needs no derived values.

Create `ecs/computed/`: `computed-database.ts` (extends the previous layer, adds
`computed` from `./index.js`), one `cached` derived value per file, and a barrel. Wire
`data/values/` helpers to the minimal observables. Name each entity-id-list computed in
the implementation's `hydrate`, and pass `computedPlugin: ComputedDatabase.plugin`.

Gate: each derivation's computed conforms.

The how is in the auto-loading `features/ecs/computed.md` rule.
