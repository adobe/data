---
paths:
  - '**/features/*/ecs/core/**/*.ts'
---

# ecs/core/ — the schema

The core database builds the feature's `data/` components and resources into a plugin
and chooses how entities are packed into archetypes.

```ts
// core/archetypes.ts — the spec entity plus implementation-only columns
export const archetypes = Database.archetypes(components, {
  Todo: ["todo", ...Todo],
});

// core/core-database.ts
const coreDatabasePlugin = Database.Plugin.create({ components, resources, archetypes });

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;
type CoreComponents = Store.Components<Database.Plugin.ToStore<typeof coreDatabasePlugin>>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  export type Index = Database.Index<CoreComponents>;
}
```

- **Import `components` and `resources` from `data/`.** Never author schemas here.
- **Spread the entity tuple** from `data/entities/` and add implementation-only
  columns (a tag). `UpperCase` archetype names.
- **Never pack a `nonPersistent` column into a persistent entity's archetype** unless
  it has a real, non-null default. On load such a column is stripped, and every
  reloaded entity then drops out of that archetype and out of every query on it. Add
  the column on demand with `t.update` instead. A persisting feature keeps a save/load
  round-trip test (`data-lit-todo`'s `app/persistence.test.ts`).
- **A feature built on another** `extends` the lower feature's core plugin and adds its
  own `components` barrel (which already spreads the lower one) and archetypes.
- **`Component` / `Archetype` key types**, when needed, derive from the `components`
  barrel (`Extract<keyof typeof components, string>`), never from the plugin: the
  plugin is built from `archetypes`, so a plugin-derived key type is circular when used
  to check an archetype.
