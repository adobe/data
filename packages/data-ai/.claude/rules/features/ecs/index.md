---
paths:
  - '**/features/*/ecs/**/*.ts'
---

# ecs/ — the Entity-Component-System layer

Everything ECS-specific lives here: the schema that stores `data/` types as
entity state (`core-database/`), the derived and mutating logic over it
(`indexes/`, `transactions/`, `computed/`), the database-bound service factories
(`services/`), the async orchestrators (`actions/`), and the layered plugins
that compose it all.

The distinction from `data/`: a `data/` type is ECS-agnostic (a plain
serializable value); an ECS construct is *how that type is stored and operated
on* inside a database. `mark: PlayerMark.schema` is not a data-model fact — it
is "the ECS keeps a PlayerMark here".

## The core schema — `core-database/`

A feature's whole schema — every component, resource, and archetype — lives in
one `core-database/` folder: `core-database.ts` plus one file per facet the
feature uses (all three facets are optional on `Database.Plugin.create`):

```
ecs/core-database/
  core-database.ts   # Database.Plugin.create({ components?, resources?, archetypes? }) → CoreDatabase
  components.ts      # export const components = Database.components({ … })
  resources.ts       # export const resources  = Database.resources({ … })
  archetypes.ts      # export const archetypes = Database.archetypes(components, { … })
```

`core-database.ts` is a thin assembler; each facet file exports one typed object
built by a `Database.*` helper. No per-item files, no barrels. Create only the
facet files the feature needs — a singleton feature with no entities is just
`resources.ts` + `core-database.ts` (no empty `components({})` boilerplate).

### Schema scopes

State divides on two orthogonal axes — **scope** (shared with peers vs. local to
this client) and **lifetime** (durable across reloads vs. ephemeral) — giving
four scopes, each stamping a flag pair:

| scope | shared? | durable? | flags |
|-------|:--:|:--:|-------|
| **document** | yes | yes | — |
| **settings** | no | yes | `nonShared` |
| **presence** | yes | no | `nonPersistent` |
| **session** | no | no | `nonPersistent` + `nonShared` |

`Database.components` / `Database.resources` group declarations by scope and
stamp the flags. Every scope key is optional — declare only the ones you use
(most features are document-only):

```ts
// components.ts
export const components = Database.components({
  document: { todo: True.schema, name: Name.schema, complete: Boolean.schema },
  session:  { dragPosition: DragPosition.schema },   // omit settings / presence
});

// resources.ts — entries must carry a `default` (enforced at the call)
export const resources = Database.resources({
  settings: { displayCompleted: Boolean.schema },
});
```

A component/resource *value* is a plain `data/`-schema re-export (or a small
inline literal); its scope — and therefore its flags — is stated only by which
group it sits in. Hover a scope key for its meaning. The database does not yet
act on these flags (see the `nonShared` schema note); they model
shared/local × durable/ephemeral now, and the durable-shared subset
(`document`) is the set a bare store could be rebuilt from for reconciliation.

**Shared columns live in `data/`.** A column two features share (e.g. a `name`
on both todos and users) is a `data/` type both reference by identity
(`Name.schema`), so `combinePlugins` dedupes it. Only the `document` scope
preserves schema identity (it applies no flags) — never share a
settings/presence/session column across features by identity.

### Archetypes

`archetypes.ts` declares the feature's entity shapes with
`Database.archetypes(components, { … })`, which validates every key against the
component map and preserves each archetype's literal tuple — no per-archetype
`as const`. Archetypes are a packing convenience, not serialized data; one may
span scopes (a document entity with an ephemeral `dragPosition` slot). An
archetype mirroring a `data/` row type carries a private compile-time
drift-guard (see `archetypes.md`).

## Layered composition (behaviour)

Above the schema, behaviour is a chain of `Database.Plugin`s, each its own
**namespace folder** — `<layer>-database/` holding the eponymous
`<layer>-database.ts` (the plugin, which `extends` the previous layer) plus the
facet folder it adds. **Name each layer for the facet it adds — never for the
feature or app.** A feature creates only the layers it uses:

```
ecs/
  core-database/            # the schema (above)
  index-database/           # extends core;        indexes/
  transaction-database/     # extends index;       transactions/
  computed-database/        # extends transaction; computed/
  service-database/         # extends computed;     services/
  action-database/          # extends service;      actions/
```

Each exports a namespace mirroring the plugin — the composed object is a
`Database` (the `@adobe/data` term) even though the folder is `ecs/`:

```ts
export type IndexDatabase = Database.Plugin.ToDatabase<typeof indexDatabasePlugin>;
export namespace IndexDatabase {
  export const plugin = indexDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
```

## What each layer takes as input

- **`plugin`** — every layer `extends` the previous layer's `plugin`; that is
  the one universal thread up the chain.
- **`Store`** (via `ToStore`) — used *only* by **transactions** (`t:
  <Layer>.Store`). A store carries the index handles and the initiating
  `userId`, so a store *is* the transaction context; there is no separate
  transaction-context type. Use **`CoreDatabase.Store`** for a transaction that
  reads/writes entities, resources, or archetypes; **`IndexDatabase.Store`** the
  moment it reads an index.
- **the whole `Database`** — **computed**, **services**, and **actions** each
  take `db: <Layer>` (the lowest layer whose database exposes what they
  read/call): computed reads `db.observe.*`; services read observables and call
  transactions; actions call `db.services.*` then `db.transactions.*`.

Each subfolder has its own rule. Modelling a plugin's authored vs. derived
surface is covered by `plugin-modelling.md`.

## Facets are flat until they aren't

A **behavioural** facet folder (`indexes/`, `transactions/`, `computed/`,
`actions/`) holds one file per item plus an `index.ts` barrel — flat while that
reads well, roughly up to half a dozen items. When a cohesive cluster grows past
that, promoting it into a themed subfolder with its own `index.ts` (re-exported
by the facet barrel) is a standard move — only once the folder actually feels
crowded:

```
transactions/
  order/                 # a cohesive cluster: fractional-ordering helpers
    index.ts  next-order.ts  normalize-order.ts  select-ordered-todos.ts
  create-todo.ts  drag-todo.ts  …
```

The **schema** facets (components / resources / archetypes) are *single files*
in `core-database/`, not folders. A whole feature should stay small enough that
subfoldering rarely bites — grow by adding features, not by bloating one.
