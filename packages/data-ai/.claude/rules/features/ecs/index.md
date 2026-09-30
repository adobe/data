---
paths:
  - '**/features/*/ecs/main-service.ts'
  - '**/features/*/ecs/*/*-database.ts'
---

# ecs/ — the implementation

The feature implemented as a reactive Entity-Component-System, conformed to
`spec/`. It is a chain of `Database.Plugin` layers, each extending the one before and
adding one facet:

```
ecs/
  core/          core-database.ts, archetypes.ts        the schema (core.md)
  indexes/       index-database.ts + one file per index + index.ts
  transactions/  transaction-database.ts + one file per transaction + index.ts
  computed/      computed-database.ts + one file per computed + index.ts
  services/      service-database.ts + database-bound service factories
  actions/       action-database.ts + one file per action + index.ts
  systems/       system-database.ts (systems declared inline)
  main-service.ts
  conformance/   test tier (conformance.md)
```

The order is fixed: `core → indexes → transactions → computed → services → actions
→ systems`. A feature creates only the layers it uses. Each layer's file exports a
namespace mirroring its plugin:

```ts
const indexDatabasePlugin = Database.Plugin.create({ extends: CoreDatabase.plugin, indexes });
export type IndexDatabase = Database.Plugin.ToDatabase<typeof indexDatabasePlugin>;
export namespace IndexDatabase {
  export const plugin = indexDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
```

Runtime code here imports `data/` and `services/`, never `spec/`.

## `MainService` — the assembled database

`main-service.ts` aliases the top layer, so consumers never name it:

```ts
export { ActionDatabase as MainService } from "./actions/action-database.js";
```

`ui/`, `app/` and `conformance/` reference `MainService.plugin` / `MainService.Store`.
Adding or dropping a layer changes this one line. When another feature or package
imports a feature's databases, it aliases them feature-qualified
(`import { CoreDatabase as MainCoreDatabase }`).

## What each op takes

- **Transactions** take the store: `CoreDatabase.Store`, or `IndexDatabase.Store` once
  they read an index. A store is the transaction context (it carries index handles and
  `t.userId`).
- **Computed, service factories and actions** take the whole database, typed on the
  lowest layer that exposes what they read or call — never their own layer.

## Folders are flat until they aren't

A behavioural folder holds one file per op plus an `index.ts` barrel that feeds the
facet. When a cohesive cluster grows past about half a dozen files, give it a
subfolder with its own `index.ts` (e.g. `transactions/order/`). A helper several ops
share lives beside them but stays **out of the barrel**, or it would be registered
as an op.

The per-layer rules are in this folder. How a plugin's authored and derived surfaces
are modelled is in the rules-root `plugin-modelling.md`.
