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

### Schema scopes

State divides on two orthogonal axes — **scope** (shared with peers vs. local
to this client) and **lifetime** (durable across reloads vs. ephemeral) —
giving four scopes, each its own schema layer holding components/resources with
a fixed flag pair:

| scope | shared? | durable? | `nonPersistent` | `nonShared` |
|-------|:--:|:--:|:--:|:--:|
| **document** | yes | yes | — | — |
| **settings** | no | yes | — | ✅ |
| **presence** | yes | no | ✅ | — |
| **session** | no | no | ✅ | ✅ |

- **`document-database/`** — the collaborative, serialized model: what peers
  sync + save, and the set a bare store could be rebuilt from for
  reconciliation. Extends nothing.
- **`settings-database/`** — per-device preferences: durable but never synced
  (`nonShared: true`).
- **`presence-database/`** — live awareness (cursors, "typing"): synced but
  never saved (`nonPersistent: true`).
- **`session-database/`** — transient local UI state (drag offset, hover):
  neither (`nonPersistent: true` **and** `nonShared: true`).

Above the scope layers sits the packing layer:

- **`archetype-database/`** — named entity shapes. Archetypes are an
  iteration/packing convenience, **not** part of the serialized model, so they
  live above the scopes (not in `document`). It extends the topmost scope layer
  the feature defines, so one archetype may pack columns from several scopes
  (e.g. a document entity with an ephemeral `dragPosition` slot).

```
ecs/
  document-database/
    document-database.ts    # extends nothing; the shared+durable schema root
    components/  resources/
  settings-database/        # optional — local+durable
    settings-database.ts    # extends document; each facet nonShared: true
    resources/
  session-database/         # optional — local+ephemeral
    session-database.ts     # extends settings (or document); nonPersistent + nonShared
    components/
  archetype-database/
    archetype-database.ts   # extends the topmost scope layer
    archetypes/
  index-database/
    index-database.ts       # extends archetype
    indexes/
  transaction-database/ …   # extends index, then computed / service / action
```

**Most features are document-only** (plus `archetype-database`). Add
`settings`, `presence`, or `session` **only** when the feature actually has
state of that scope — many apps never need `presence`, and plenty never need
`settings` or `session`. The scope layers chain in the order above (`document`
→ `settings` → `presence` → `session`), each extending the previous one that
*exists*; `archetype-database` extends whichever is topmost.

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
  the transaction touches: **`DocumentDatabase.Store`** when it reads/writes
  only document entities and resources; the matching scope store
  (`SettingsDatabase.Store` / `SessionDatabase.Store`) when it touches that
  scope's state; **`ArchetypeDatabase.Store`** the moment it uses any archetype
  (`t.archetypes.*`, `t.select`/`queryArchetypes` over an archetype);
  `IndexDatabase.Store` when it reads an index.
- **the whole `Database`** — **computed**, **services**, and **actions**
  each take `db: <Layer>` (the lowest layer whose database exposes what they
  read/call): computed reads `db.observe.*`; services read observables and
  call transactions; actions call `db.services.*` then `db.transactions.*`.

Each subfolder has its own rule. Modelling a plugin's authored vs. derived
surface is covered by `plugin-modelling.md`.

## The scope split is verified

The split is not a naming convention you police by eye — assert it. Add a
`schema-scopes.test.ts` at the **feature root** (`features/<name>/`) that calls
`assertSchemaScopes` from `@adobe/data/ecs` with whichever scope plugins the
feature defines:

```ts
import { assertSchemaScopes } from "@adobe/data/ecs";
import { DocumentDatabase } from "./ecs/document-database/document-database.js";
import { SettingsDatabase } from "./ecs/settings-database/settings-database.js";
import { SessionDatabase } from "./ecs/session-database/session-database.js";

test("feature schema scopes are consistent", () => {
  assertSchemaScopes({
    document: DocumentDatabase.plugin,
    settings: SettingsDatabase.plugin, // omit scopes the feature doesn't have
    session: SessionDatabase.plugin,
  });
});
```

It throws if any component/resource a scope layer *adds* carries the wrong flag
pair (per the scope table above) — catching a durable-local `settings` value
that forgot `nonShared`, a transient column that leaked into `document`, and so
on. The flags are authored explicitly per file (see `components.md` /
`resources.md`); this test is the safety net, not a substitute for stating
them. A document-only feature still adds the test — it just passes
`{ document }`.

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
