---
paths:
  - '**/features/*/services/main-service/**/core-database/core-database.ts'
---

# core-database/core-database.ts — the assembled schema + its namespace

A thin assembler: `Database.Plugin.create({ components?, resources?, archetypes? })`
over the facet files, exposed through the `CoreDatabase` namespace. This is the
single-file namespace form (one value export — `plugin` — everything else a type;
see `global/namespace.md`).

```ts
import { Database, type Store } from "@adobe/data/ecs";
import { components } from "./components.js";
import { resources } from "./resources.js";
import { archetypes } from "./archetypes.js";

const coreDatabasePlugin = Database.Plugin.create({ components, resources, archetypes });

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;
// Resolved component map, at module scope so the imported `Store` namespace isn't
// shadowed by `CoreDatabase.Store` below.
type CoreComponents = Store.Components<Database.Plugin.ToStore<typeof coreDatabasePlugin>>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  /** The store transactions operate on — a store *is* the transaction context. */
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<CoreComponents>;
  /** A component name, and a component-key tuple — an archetype's defining shape, or the key
   *  list of a `count` / `select` query. */
  export type Component = Extract<keyof typeof components, string>;
  export type Archetype = readonly Component[];
}
```

## Derive `Component` / `Archetype` from `components`, never the plugin

Read the keys straight from the leaf `components` module
(`Extract<keyof typeof components, string>`). Do **not** derive them from the
plugin (`Store.Components<ToStore<plugin>>`, i.e. `CoreComponents`): the plugin is
built *from* `archetypes`, so a plugin-derived `Archetype` is **circular** the
moment it is used to `satisfies`-check an archetype tuple — and the cycle
collapses the entire database type to `{}`. The leaf derivation is cycle-free and
usable both in `archetypes.ts` (to check shared bases) and downstream (to check
`count` / `select` query keys).
