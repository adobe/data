---
name: build-transactions
description: Build a feature's ecs transaction-database — atomic mutations over the store.
---

Create `ecs/transaction-database/`: `transaction-database.ts` (extends `IndexDatabase`, adds
`transactions` from `./transactions/index.js`) plus a `transactions/` folder — one mutation per
file + barrel. Type the store param `CoreDatabase.Store` (entities/resources/archetypes) or
`IndexDatabase.Store` (reads an index).

Comes after `index-database` (or `core-database` if no indexes).

The how is in the auto-loading `features/ecs/transactions.md` rule.
