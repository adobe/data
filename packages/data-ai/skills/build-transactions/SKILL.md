---
name: build-transactions
description: Build a feature's ecs/transactions layer.
input: feature
output: feature
---

Create `ecs/transactions/`: `transaction-database.ts` (extends the previous layer, adds
`transactions` from `./index.js`), one mutation per file, and a barrel. Type the store
`CoreDatabase.Store`, or `IndexDatabase.Store` once it reads an index. Guard by entity
kind, and apply `data/values/` helpers; never import `spec/`.

Build the transactions the spec actions will need. They are conformed through the
actions that call them, so their gate is `build-actions`; add any missing one there.

The how is in the auto-loading `features/ecs/transactions.md` rule.
