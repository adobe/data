---
name: build-transactions
description: Build a feature's transaction-database — atomic mutations over the store.
input: feature
output: feature
---

Create `services/main-service/transaction-database/`: `transaction-database.ts` (extends the
preceding layer — `IndexDatabase` if the feature built indexes, else `CoreDatabase` — adds
`transactions` from `./transactions/index.js`) plus a `transactions/` folder — one mutation per
file + barrel. Type the store param `CoreDatabase.Store` (entities/resources/archetypes) or
`IndexDatabase.Store` (reads an index).

Comes after `index-database` (or `core-database` if no indexes).

The how is in the auto-loading `features/services/main-service/transactions.md` rule.
