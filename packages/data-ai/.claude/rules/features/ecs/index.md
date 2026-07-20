---
paths:
  - '**/features/*/ecs/**/*.ts'
---

# ecs/ — the Entity-Component-System layer

Everything ECS-specific lives here: the bindings that store `data/` types
as entity state (`components/`, `resources/`, `archetypes/`), the derived
and mutating logic over them (`computed/`, `indexes/`, `transactions/`),
the database-bound service factories (`services/`), the async orchestrators
(`actions/`), and the layered plugins that compose it all.

The distinction from `data/`: a `data/` type is ECS-agnostic (a plain
serializable value); an ECS construct is *how that type is stored and
operated on* inside a database. `mark = PlayerMark.schema` is not a
data-model fact — it is "the ECS keeps a PlayerMark here".

## Layered composition

The database is a chain of `Database.Plugin`s. Each layer is its own
**namespace folder** — `<layer>-database/` holding the eponymous
`<layer>-database.ts` (the plugin, which `extends` the previous layer) plus
the facet folder(s) that feed it. **Name each layer for the facet it adds —
never for the feature or app.** A feature creates only the layers it uses;
the topmost one it defines is its composition root, and the UI binds to that.

```
ecs/
  core-database/
    core-database.ts        # extends nothing; the schema root
    components/  resources/  archetypes/
  index-database/
    index-database.ts       # extends core
    indexes/
  transaction-database/
    transaction-database.ts # extends index
    transactions/
  computed-database/
    computed-database.ts    # extends transaction
    computed/
  service-database/
    service-database.ts     # extends computed  (facet folder only if it has ecs/services/)
  action-database/
    action-database.ts      # extends service   (async orchestration; often the root)
    actions/
```

Grouping each layer's facets under its folder keeps the layer cohesive: one
folder holds everything that defines that layer, mirroring the `data/`
namespace-folder pattern (folder + eponymous file). Cross-layer imports are
correspondingly `../../<layer>-database/<layer>-database.js`.

Each exports a namespace mirroring the plugin. The composed object is a
`Database` — the `@adobe/data` term — even though the folder is `ecs/`:

```ts
export type IndexDatabase = Database.Plugin.ToDatabase<typeof indexDatabasePlugin>;
export namespace IndexDatabase {
    export const plugin = indexDatabasePlugin;
    export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
```

## What each layer takes as input

- **`plugin`** — every layer `extends` the previous layer's `plugin`; that
  is the one universal thread up the chain.
- **`Store`** (via `ToStore`) — used *only* by **transactions**
  (`t: <Layer>.Store`). A store carries the index handles and the
  initiating `userId`, so a store *is* the transaction context; there is no
  separate transaction-context type.
- **the whole `Database`** — **computed**, **services**, and **actions**
  each take `db: <Layer>` (the lowest layer whose database exposes what they
  read/call): computed reads `db.observe.*`; services read observables and
  call transactions; actions call `db.services.*` then `db.transactions.*`.

Each subfolder has its own rule. Modelling a plugin's authored vs. derived
surface is covered by `plugin-modelling.md`.
