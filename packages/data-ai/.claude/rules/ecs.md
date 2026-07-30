---
paths:
  - '**/*-plugin.ts'
  - '**/*-plugin/**/*.ts'
  - '**/*-database.ts'
---

# Database.Plugin authoring

Plugins are created with `Database.Plugin.create()` from `@adobe/data/ecs`.

## Property order (enforced at runtime)

Properties **must** appear in this exact order. All are optional.

| #   | Property       | Signature                              | Purpose                                   |
| --- | -------------- | -------------------------------------- | ----------------------------------------- |
| 1   | `imports`      | `Plugin`                               | Dep plugin: types usable, NOT re-exported |
| 2   | `extends`      | `Plugin`                               | Base plugin to extend (types re-exported) |
| 3   | `services`     | `(db) => ServiceInstance`              | Singleton service factories               |
| 4   | `components`   | schema object                          | ECS component schemas                     |
| 5   | `resources`    | `{ default: value as Type }`           | Global resource schemas                   |
| 6   | `archetypes`   | `['comp1', 'comp2']`                   | Standard ECS archetypes                   |
| 7   | `indexes`      | `{ key, order?, unique?, archetype? }` | Sorted/filtered entity indexes            |
| 8   | `computed`     | `(db) => Observe<T>`                   | Computed observables                      |
| 9   | `transactions` | `(store, payload) => void`             | Synchronous atomic mutations              |
| 10  | `actions`      | `(db, payload) => T`                   | General functions                         |
| 11  | `systems`      | `{ create: (db) => fn \| void }`       | Per-frame (60fps) or init-only            |

**Wrong order throws at runtime.**

---

## Composition

**Single extension:**

```ts
export const authPlugin = Database.Plugin.create({
  extends: environmentPlugin,
  services: {
    auth: db => AuthService.createLazy({ services: db.services }),
  },
});
```

**Combine** — `extends` accepts only one plugin. For multiple, use `Database.Plugin.combine`:

```ts
export const generationPlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(aPlugin, bPlugin),
  computed: { ... },
});
```

**`imports` vs `extends`** — both make the dep's declarations usable in this plugin's factory bodies and merge it at runtime. The difference
is the result type: `extends` re-exports the dep's types into this plugin's type; `imports` does NOT. Use `imports` for a dep whose types
you don't want propagating downstream — it keeps the result type O(local), so the dep's type params (e.g. an index `IX`) never accumulate
through a deep `combine` chain (the TS2589 fix). The runtime merge means no separate top-level `combine` is needed for the imported plugin.

```ts
export const consumerPlugin = Database.Plugin.create({
  imports: indexesPlugin, // db.indexes usable here + registered at runtime; IX not re-exported
  extends: corePlugin,
  computed: { ... },
});
```

**Final composition:**

```ts
export const appPlugin = Database.Plugin.combine(corePlugin, themePlugin, dataPlugin, authPlugin, uiPlugin, featurePlugin);
export type AppPlugin = typeof appPlugin;
export type AppDatabase = Database.Plugin.ToDatabase<AppPlugin>;
```

---

## Data modeling example

```ts
import { Database } from '@adobe/data/ecs';
import { Vec3, Vec4, F32 } from '@adobe/data/math';

const particleDataPlugin = Database.Plugin.create({
  components: {
    position: Vec3.schema,
    velocity: Vec3.schema,
    color: Vec4.schema,
    mass: F32.schema,
  },
  resources: {
    gravity: { default: 9.8 as number },
  },
  archetypes: {
    Particle: ['position', 'velocity', 'color', 'mass'],
  },
});
```

- **Components**: per-entity data. Use schema imports (`Vec3`, `Vec4`, `F32` from `@adobe/data/math`) or type namespaces for custom shapes.
- **Resources**: global state. Use **only** `{ default: value as Type }`.
- **Archetypes**: one per entity kind. List all components that kind requires.

---

## Property details

### components

Non-persistable values (e.g. HTML elements, DOM refs) must use `ephemeral: true` on the schema.

```ts
components: {
  layout: Layout.schema,
  layoutElement: { default: null as unknown as HTMLElement, ephemeral: true },
},
```

### resources

Use `as Type` to provide the compile-time type. Use `null as unknown as Type` for resources initialized later in a system initializer.

```ts
resources: {
  themeColor: { default: 'dark' as ThemeColor },
  connection: { default: null as unknown as WebSocket },
},
```

### computed

Factory returning `Observe<T>` or `(...args) => Observe<T>`. Receives full db.

### transactions

Synchronous, deterministic atomic mutations. Receive `store` and a payload.

- `store.update(entity, data)` — update entity components
- `store.resources.x = value` — mutate resources
- `store.get(entity, 'component')` — read component value
- `store.select(archetype.components, { where })` — query entities

### actions

UI components that call actions must never consume returned values — see `features/ui/binding-element.md` (Actions are fire-and-forget).

**At most one transaction per action.** Multiple transactions in a single action corrupt the undo/redo stack.

### systems

`create` receives db and may optionally return a per-frame function (60fps) or just initialize values.

---

## Naming conventions

| Item        | Convention                                            | Example                      |
| ----------- | ----------------------------------------------------- | ---------------------------- |
| File        | `*-plugin.ts` (kebab-case)                            | `layout-plugin.ts`           |
| Export      | `*Plugin` (camelCase)                                 | `layoutPlugin`               |
| System      | `plugin_name__system` (snake_case, double underscore) | `layout_plugin__system`      |
| Init system | `plugin_name_initialize`                              | `ui_state_plugin_initialize` |

---

## Type utilities

```ts
export type MyDatabase = Database.Plugin.ToDatabase<typeof myPlugin>;
export type MyStore = Database.Plugin.ToStore<typeof myPlugin>;
```

---

## State minimalism

Before adding any `resource`, `component`, or `computed` to a plugin, identify at least one concrete subscriber that reads it. State that
nothing subscribes to is dead state — it occupies schema space, complicates serialization, and creates false surface area for future
maintainers.

**Before adding state, ask:**

1. Which UI component, computed, or action reads this?
2. Can a direct function call replace this entirely (avoiding a transaction that writes state only to read it back immediately)?
3. Is this "tracking in case it's needed" — if yes, do not add it.

**Computed vs. type utility:**

When a derivation is a pure function of a single typed value with no observable subscription needed, prefer a **type utility function** over
a computed state:

```ts
// WRONG — computed state when a type utility suffices
computed: {
  hasMinimumDuration: db => Observe.withMapData([db.resources.clip], clip => clip.duration >= 8);
}

// CORRECT — type utility; zero subscription overhead, testable in pure unit tests
// types/clip/clip.ts
export namespace Clip {
  export const hasMinimumDuration = (clip: Clip): boolean => clip.duration >= 8;
}
// Usage: Clip.hasMinimumDuration(clip) — no observable, no subscription
```

Use a computed only when the result must be observable (i.e. UI needs to react when the underlying data changes). Use a type utility when
the derivation is needed inline and does not require reactivity.

---

## Type safety

Plugin code must be **fully and honestly typed**. No `as` / `as unknown as` casts (including on `db.get()` results), no `db: any` /
`db: unknown` parameters, and no hand-written "surface" / "launder" types that approximate the real database or store and get cast into. We
hold database-plugin typing to a strict standard: if the types fight you, the fix is to model the plugin correctly (or fix the framework) —
never to cast around it.

### Type every `db` / `t` / `store` with its real surface

A factory, transaction, action, or system parameter must be the plugin's actual database or store type — or a type **derived** from it
(`Database.Plugin.ToDatabase`, `ToStore`, `Database.Archetype.RowOf`). It must reflect what the framework actually passes. Do **not**
declare a narrow structural subset and cast the real value into it. If the body needs services, resources, archetypes, or computeds, make
them genuinely present on the plugin so the parameter type already carries them:

- **`extends`** the right base so the store/db includes what you read and write — e.g. a transaction that mutates a resource archetype must
  live on a plugin whose `extends` chain declares that archetype, or the store type won't have it.
- **`imports`** a dependency plugin to use its surface inside your factory bodies _without_ re-exporting its types into your result type —
  it stays out of downstream `combine` chains and is runtime-merged + identity-deduped.

### Cross-plugin reads follow rules, not casts

- A computed factory can read its **base** plugin's resolved computeds, but not a **sibling** computed declared in the same `computed: {}`
  block (circular). To reuse a sibling's logic, either: (a) put the shared computed on a base plugin and `extends` it; or (b) author each
  computed as a standalone exported factory `(db) => Observe<T>` and have the consumer import that factory and call it directly
  (`otherComputed(db)`) instead of reaching for `db.computed.other`. A direct call builds a fresh `Observe` per call — wrap the factory in
  `memoize` from `@adobe/data/cache` (keyed on `db`) if callers must share one instance.
- An **inline** system/action body gets a contextually-typed `db`; a **standalone** exported system/action object does not, and cannot
  import its own plugin's db type (circular). Prefer inline definitions where a typed `db` matters.

### Brand domain types at the schema

Model a branded value as a branded **scalar** (`number & Brand`) and brand it at the component/resource schema:
`{ ...numberSchema, default: x as Branded }`. The stored shape equals the runtime shape, so the column types as the brand with **zero
runtime cost** — reads and writes need no conversion.

### We own `@adobe/data` — fix the root, don't cast

If clean, strong typing is genuinely blocked by a framework limitation (the library's types cannot express something correctly), that is
**not** license to cast. Surface it as a change request to `@adobe/data` and fix it at the source, then type the plugin honestly. The repo
is maintained by **knye** — raise it with him.

### Casts are a last resort, never a convenience

Before any cast, you must have exhausted: the real db/store type, `extends` / `imports`, schema-level branding, and an `@adobe/data` change.
If a cast is still unavoidable for a runtime invariant the compiler cannot see, funnel it through **one** named, documented boundary helper
and back it with a compile-time drift guard (`Assert<Extends<…>>`) so it can never silently lie.

## Service registration

Services must be registered through `Database.Plugin.create({ services: { name: db => createService(db) } })`, not bolted on via
`Object.assign`.

---

## Execute

When creating or modifying a plugin:

1. Verify property order matches the table (imports, extends, services, components, resources, archetypes, indexes, computed, transactions,
   actions, systems).
2. Use `extends` for single-parent, `Database.Plugin.combine()` for multiple peers.
3. Ensure services only access `db.services` from extended plugins (not forward references).
4. Export `type *Database = Database.Plugin.ToDatabase<typeof *Plugin>` when consumers need typed db access.
5. Follow naming conventions for files, exports, and systems.
