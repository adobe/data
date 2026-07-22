---
name: build-computed
description: Build a feature's ecs computed-database — derived observable values.
---

Create `ecs/computed-database/`: `computed-database.ts` (extends the previous layer, adds
`computed` from `./computed/index.js`) plus a `computed/` folder — one `cached` derived value
per file + barrel. Derivation logic lives in `data/`; a computed only wires a db observable to it.

Comes after `transaction-database`.

The how is in the auto-loading `features/ecs/computed.md` rule.
