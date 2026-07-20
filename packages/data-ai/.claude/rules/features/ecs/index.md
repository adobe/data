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
the topmost one it defines is its composition root.

The schema root is **split in two by persistence lifecycle**:

- **`persistent-database/`** — the durable, serializable data model: the
  components and resources a human reasons about as the feature's logical
  state, and the exact set a bare store could be rebuilt from for
  reconciliation. Extends nothing. Nothing transient lives here.
- **`session-database/`** — transient, session-only state layered on top:
  session components/resources (each explicitly `nonPersistent: true`) **and
  the archetypes**. Archetypes live here because they are a physical packing
  convenience, not part of the serialized data model — so higher layers extend
  `session`, not `persistent`.

```
ecs/
  persistent-database/
    persistent-database.ts  # extends nothing; the durable schema root
    components/
    resources/
  session-database/
    session-database.ts     # extends persistent; transient state + the archetypes
    components/             # each explicitly nonPersistent: true
    resources/              # each explicitly nonPersistent: true
    archetypes/
  index-database/
    index-database.ts       # extends session
    indexes/
  transaction-database/
    transaction-database.ts # extends index
    transactions/
  computed-database/
    computed-database.ts    # extends transaction
    computed/
  service-database/
    service-database.ts     # extends computed
  action-database/
    action-database.ts      # extends service
    actions/
```

A feature with no transient state still has a `session-database/` — it is
where the archetypes live. A feature may omit `persistent-database/` resources
(or even components) if it has none; create only the facets it uses.

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
  separate transaction-context type. Pick the lowest layer that exposes what
  the transaction touches: **`PersistentDatabase.Store`** when it reads/writes
  only persistent entities and resources; **`SessionDatabase.Store`** the
  moment it touches a session component/resource *or any archetype* (archetypes
  live at the session layer); `IndexDatabase.Store` when it reads an index.
- **the whole `Database`** — **computed**, **services**, and **actions**
  each take `db: <Layer>` (the lowest layer whose database exposes what they
  read/call): computed reads `db.observe.*`; services read observables and
  call transactions; actions call `db.services.*` then `db.transactions.*`.

Each subfolder has its own rule. Modelling a plugin's authored vs. derived
surface is covered by `plugin-modelling.md`.

## The persistent/session split is verified

The split is not a naming convention you have to police by eye — assert it. Add
a `persistence-partition.test.ts` at the **feature root** (`features/<name>/`)
that calls `assertPersistencePartition` from `@adobe/data/ecs` with the
feature's persistent and session plugins:

```ts
import { assertPersistencePartition } from "@adobe/data/ecs";
import { PersistentDatabase } from "./ecs/persistent-database/persistent-database.js";
import { SessionDatabase } from "./ecs/session-database/session-database.js";

test("feature persistence partition is consistent", () => {
  assertPersistencePartition(PersistentDatabase.plugin, SessionDatabase.plugin);
});
```

It throws if any persistent component/resource is marked `nonPersistent`, or if
any component/resource the session plugin adds is missing `nonPersistent: true`
— catching both a transient column that leaked into the durable model and a
session column that forgot its flag. The flag is authored explicitly per file
(see `components.md` / `resources.md`); this test is the safety net, not a
substitute for stating it.

## Facets are flat until they aren't

A facet folder holds one file per item (one component, one transaction, …)
plus an `index.ts` barrel — flat while that reads well, roughly up to half a
dozen items. When a **cohesive cluster** of related items grows past that,
promoting it into a themed subfolder with its own `index.ts` (re-exported by
the facet barrel) is a standard, accepted move — not preemptively, only once
the folder actually feels crowded:

```
transactions/
  order/                 # a cohesive cluster: fractional-ordering helpers
    index.ts             # re-exports the cluster
    next-order.ts  normalize-order.ts  select-ordered-todos.ts
  create-todo.ts  drag-todo.ts  …
```

That said, a whole feature should stay small enough that this rarely bites —
see the overview's note on growing by adding features rather than bloating
one.
