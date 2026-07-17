---
paths:
  - '**/ecs/**/*.ts'
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

The database is a chain of `Database.Plugin`s, each in its own
`<facet>-database.ts` file that `extends` the previous layer and adds one
facet. **Name each layer for the facet it adds — never for the feature or
app.** A feature creates only the layers it uses; the topmost one it
defines is its composition root, and the UI binds to that.

```
core-database.ts         # components, resources, archetypes
index-database.ts        # + indexes/
transaction-database.ts  # + transactions/
computed-database.ts     # + computed/
service-database.ts      # + services/
action-database.ts       # + actions/       (async orchestration; often the root)
```

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
