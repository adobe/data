# data-ecs guide

How to use the ECS, from the basics up. Each section is a short explanation, an excerpt, and a link to the example
test it comes from, under [`src/guide/`](src/guide/). The examples are complete: each file declares what it uses,
creates its own world and asserts only through the world's public reads. [`design.md`](design.md) is the contract,
with the reasoning behind each rule.

1. [Setup](#1-setup)
2. [Components and resources](#2-components-and-resources)
3. [Systems](#3-systems)
4. [Scheduling and composites](#4-scheduling-and-composites)
5. [Change filters](#5-change-filters)
6. [Lookups](#6-lookups)
7. [Arguments](#7-arguments)
8. [Sync points](#8-sync-points)
9. [Kernels](#9-kernels)
10. [Reductions](#10-reductions)
11. [GPU kernels and render systems](#11-gpu-kernels-and-render-systems)
12. [Traits](#12-traits)
13. [Rules](#13-rules)
14. [Within](#14-within)
15. [Entity references](#15-entity-references)
16. [Finalizers](#16-finalizers)
17. [Changes finalizers](#17-changes-finalizers)
18. [Loading resources asynchronously](#18-loading-resources-asynchronously)
19. [Reference](#19-reference)

## 1. Setup

The Vite plugin compiles kernel systems at build time and checks that every system's declaration lists exactly what
its body uses. Workers share memory, so pages need cross-origin isolation.

```ts
import { kernelPlugin } from "@adobe/data-ecs/compiler";
export default defineConfig({ plugins: [kernelPlugin()] });
```

[`vite.sample.config.ts`](vite.sample.config.ts) serves the samples with the plugin and the isolation headers from
[`vitest.plugins.ts`](vitest.plugins.ts#L8-L19).

Types are declared by augmenting interfaces. An application augments the package's type modules:

| Declares | Augment |
|---|---|
| components | `@adobe/data-ecs/components` |
| resources | `@adobe/data-ecs/resources` |
| system, rule and finalizer names | `@adobe/data-ecs/systems`, `rules`, `finalizers` |
| traits | `@adobe/data-ecs/traits` |

The examples augment the same paths, which `tsconfig.json` maps to the package source.

## 2. Components and resources

A component or resource is an exported key, a string or a symbol, namespaced like `"game/position"`. Its traits,
`type` first, come from augmenting `Types`; registering it gives the schema for that type. A resource always has a
value, so its schema has a `default`.

```ts
export const position = "guide/components/position";
export const enemy = "guide/components/enemy";
export const gravity = "guide/components/gravity";

declare module "@adobe/data-ecs/components" {
    interface Types {
        [position]: { type: Vec3 };
        [enemy]: { type: true };
    }
}
declare module "@adobe/data-ecs/resources" {
    interface Types {
        [gravity]: { type: number };
    }
}
Component.register(position, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });
Resource.register(gravity, { type: { type: "number", default: -9.8 } });
```

Entities are spawned by systems, and read between runs through `world.query` and `world.read`:

```ts
await using world = await World.create({ systems: [spawn] });
await world.run(spawn);
const [first] = world.query.select([position, enemy]);
expect(world.read.component(first, position)).toEqual([0, 10, 0]);
```

Example: [`01-components.test.ts`](src/guide/01-components.test.ts#L4-L42).

- **Registration must match the declaration**, trait for trait, with `type` a schema for the declared type. Otherwise it doesn't compile.
- **`World.create({ systems })` resolves once its systems are registered.** `await using` disposes the world.
- **`Entity` is a branded number.** `Entity.none` names no entity: it's what zeroed memory and entity defaults hold, and a lookup of it returns null.
- **Rejected:** a duplicate name, across components, resources and traits, at registration.

## 3. Systems

A system matches entities with every component in its query's `read`, `write` and `has`, and none in `not`. Its body
runs once per row: `row` holds the components it reads and writes, `context` its resources, lookups and arguments,
and `commands` its structural changes. Values are replaced whole, never edited in place.

```ts
const move = System.create({
    name: "guide/systems/move",
    query: { read: [position, velocity], write: [position], not: [frozen] },
    resources: { read: [delta] },
}, (row, context) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], context[delta]));
});
```

A system without a query runs once per run, with resources only.

Example: [`02-systems.test.ts`](src/guide/02-systems.test.ts#L42-L64).

- **Declarations list exactly what bodies use.** A key the body never uses is a build error, as is one it uses without listing it.
- **Rejected:** reads of undeclared components (types), unused declared ones (build), a write to a component a system only reads (types).

## 4. Scheduling and composites

There's no built-in schedule: the application runs a composite each frame. Order comes only from `before`, `after`
and `during`; systems with no ordering path between them may run in parallel.

```ts
const heal = System.create({ name: "guide/scheduling/heal", query: { read: [health], write: [health] }, after: ["guide/scheduling/hit"] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
const frame = System.composite({ name: "guide/scheduling/frame", systems: [heal, hit] });
```

Example: [`03-scheduling.test.ts`](src/guide/03-scheduling.test.ts#L27-L50).

- **Rejected:** two members that both write a component or resource, or where one reads what the other writes, with no ordering path between them, at registration.

## 5. Change filters

`added` and `changed` pass rows whose listed components were added or written since that system last ran, so each
system sees each change once. Only rows a body actually writes are marked changed. A resource in `resources.changed`
passes every row when it changes, including on the first run, so systems that set things up need no run-once flag.

```ts
const load = System.create({ name: "guide/filters/load", resources: { read: [level], changed: [level] } }, (_, context, commands) => {
    for (let i = 0; i < context[level] * 2; i++) commands.spawn({ [score]: 0, [shown]: -1, [enemy]: true });
});
const show = System.create({ name: "guide/filters/show", query: { read: [score], write: [shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
```

Example: [`04-change-filters.test.ts`](src/guide/04-change-filters.test.ts#L34-L58).

- **`changed` is conservative:** it means "may have changed".

## 6. Lookups

A lookup reads another entity's components by id. It returns null for an entity that's dead, `Entity.none`, or
missing a component in its `read`.

```ts
const follow = System.create({
    name: "guide/lookups/follow",
    query: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { targets }) => {
    const other = targets(row[target]);
    row[velocity] = other === null ? [0, 0, 0] : Vec3.subtract(other[position], row[position]);
});
```

Example: [`05-lookups.test.ts`](src/guide/05-lookups.test.ts#L26-L48).

- **Rejected:** a lookup reading a component its own system writes, at registration.

## 7. Arguments

`args` is a schema for a read-only input to each run, passed as `world.run(system, args)`. A system name and its
arguments make a replicable transaction.

```ts
const place = System.create({
    name: "guide/arguments/place",
    args: { type: "object", properties: { x: { type: "number" }, count: { type: "integer" } } },
}, (_, { args }, commands) => {
    for (let i = 0; i < args.count; i++) commands.spawn({ [position]: [args.x, i, 0] });
});
await world.run(place, { x: 3, count: 2 });
```

Example: [`06-arguments.test.ts`](src/guide/06-arguments.test.ts#L19-L32).

- **Not yet:** a system with arguments can't use `added` or `changed`, or be a member of a composite.

## 8. Sync points

Commands are structural changes. Every run ends in a sync point that applies them together as their net effect: a
spawn isn't visible to later systems in the same run, and a component added and removed within one sync point was
never there. A run whose system throws still applies its commands, then rejects.

```ts
const spawn = System.create({ name: "guide/sync/spawn" }, (_, __, commands) => {
    const entity = commands.spawn({ [unit]: 1 });
    commands.add(entity, { [shield]: true });
    commands.remove(entity, shield);
});
```

Example: [`07-sync-points.test.ts`](src/guide/07-sync-points.test.ts#L32-L62).

- **`spawn` returns a real entity at once,** which can be stored, including in the spawner's own row.
- **Commands against dead entities do nothing.**

## 9. Kernels

`kernel: "cpu"` compiles a system at build time to efficient JS, and to WASM where its body allows, and runs it in
chunks across workers. Kernels read and write linear values (numbers, booleans, entities, fixed-length tuples and
structs of those), use lookups and commands, and call pure functions from any module the build resolves, which are
inlined. Results match the body run as written.

```ts
const chase = System.create({
    name: "guide/kernels/chase",
    kernel: "cpu",
    query: { read: [position, velocity, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { targets }, commands) => {
    const other = targets(row[target]);
    if (other === null) return;
    row[velocity] = steer(row[velocity], Vec3.subtract(other[position], row[position]), 2);
    // A kernel builds tuple values from their leaves.
    const [x, y, z] = row[position];
    if (Vec3.distance(other[position], row[position]) < 1) commands.spawn({ [position]: [x, y, z], [spark]: true });
});
```

Example: [`08-kernels.test.ts`](src/guide/08-kernels.test.ts#L36-L66), with the inlined helper in
[`08-steer.ts`](src/guide/08-steer.ts).

- **The subset** a kernel body may use is in [`src/compiler/subset.md`](src/compiler/subset.md). The build rejects anything else, with a message at the code.
- **Math types:** `Vec2`, `Vec3`, `Vec4` (each F32, with `I32` and `U32`), `Quat`, `Mat4x4`, and the scalars, each with a `schema`, follow WGSL's semantics. See the [`math follows WGSL`](src/math/semantics.test.ts) tests.
- **What a kernel compiles to:** JS, WGSL and WASM output for one system, in [`generated-code.md`](src/world/create/generated-code.md).
- **Rejected:** a kernel that wasn't compiled, at registration; a body outside the subset, at build.

## 10. Reductions

A reduction folds what each row contributes into a resource: `"+"`, `"*"`, `"min"`, `"max"`, or bitwise `"&"`, `"|"`
and `"^"`, leaf by leaf over tuples and structs. Each run replaces the resource with the fold of that run, across
workers and deterministically for one world configuration.

```ts
const measure = System.create({
    name: "guide/reductions/measure",
    kernel: "cpu",
    query: { read: [position, mass] },
    resources: { reduce: { [total]: "+", [lowest]: "min" } },
}, (row, context) => {
    const [x, y, z] = row[position];
    context[total](row[mass]);
    context[lowest]([x, y, z]);
});
```

Example: [`09-reductions.test.ts`](src/guide/09-reductions.test.ts#L37-L56).

- **Rejected:** a reduced resource that the system also reads, writes or filters on, at registration and in types; a query with change filters; two systems reducing one resource.
- **Not yet:** reductions in GPU kernels.

## 11. GPU kernels and render systems

`kernel: "gpu"` runs a system as a compute shader in a world created with a device, and as a `"cpu"` kernel in one
without. Its values are 4-byte numbers and booleans, so numbers need `precision: 1`, as the math schemas have. Writes
stay on the GPU until something on the CPU needs them, or `world.synchronize` asks.

```ts
const move = System.create({ name: "guide/gpu/move", kernel: "gpu", query: { read: [position, velocity], write: [position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});
const world = await World.create({ gpu: { device }, systems: [spawn, move] });
```

Example: [`10-gpu.browser.test.ts`](src/guide/10-gpu.browser.test.ts#L28-L46).

A render system records GPU work over the GPU copy of the components its accessors name. `Gpu.wgsl(system)` gives
its shaders' declarations, a function per accessor, and pipelines take `world.gpu.layout`. See the particle sample's
[declaration](src/sample/gpu/particles.ts#L109-L114) and [draw](src/sample/gpu/particles.ts#L120-L148), wired up in
[`main.ts`](src/sample/gpu/main.ts#L58-L63).

- **Not yet:** lookups, change filters, commands, loops and reductions in GPU kernels.

## 12. Traits

A component's record lists its traits. `type` is the value type; the others are declared the same way and given again
at registration:

- **`derived: true`:** only rules add and remove the component; commands reject it. Its schema has a `default`. See [Rules](#13-rules).
- **`within: host`:** `host` is another component on the same entity. The component can be on an entity only while
  `host` is too: when `host` leaves, by any cause, the component leaves with it in the same sync point, and one added
  to an entity without `host` is dropped. See [Within](#14-within).
- **`reference: "owner" | "weak"`:** on a component whose value is an `Entity`, the entity it points to is its
  target, and the entity that has the component is its holder. When the target despawns, `"owner"` despawns the
  holder too, and `"weak"` removes the component from the holder. See [Entity references](#15-entity-references).

A trait is a member of `Trait.Types<N>`, so other packages define traits the same way: the member is the value the
trait allows on component `N`, or `never` where it doesn't apply. Types then filter components by trait.

```ts
declare module "@adobe/data-ecs/traits" {
    interface Types<N> {
        readonly [instanced]: N extends Component.Name ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

check<Equal<Extract<Component.With<typeof instanced>, Guide>, typeof transform>>();
check<Equal<Extract<Component.Where<Entity>, Guide>, typeof parent>>();
```

Example: [`11-traits.type-test.ts`](src/guide/11-traits.type-test.ts), checked by the compiler alone.

- **Filters:** `Component.With<Trait, Value?>`, `Component.Where<ValueType>`, `Component.Derived`, `Component.Essential` (what commands take), and `Component.Writable` (what systems may write: everything but references).
- **Rejected:** a trait value its definition doesn't allow on that component, a missing or undeclared trait, or a schema that doesn't match the type, in types; an unregistered trait, at registration.

## 13. Rules

A rule says that entities matching its query have the components it derives, and only while they match. Rules can
build on what other rules derive, and several can derive one component, which is then present while any of them
matches. Derived components start at their schema's default, stamped `added`, and systems write their values.

```ts
const meshes = Rule.create({ name: "guide/rules/meshes", query: { has: [mesh], not: [hidden] }, derives: [drawn] });
const sprites = Rule.create({ name: "guide/rules/sprites", query: { has: [sprite], not: [hidden] }, derives: [drawn] });
const layers = Rule.create({ name: "guide/rules/layers", query: { has: [drawn] }, derives: [layer] });
```

Example: [`12-rules.test.ts`](src/guide/12-rules.test.ts#L36-L64).

- **The result depends only on which components an entity has,** so it's computed once per archetype, and a change is still a single move.
- **A rule registered after entities exist** applies at the next sync point.
- **Rejected:** deriving a component that isn't `derived`, and a cycle of rules through a `not`, which could oscillate, at registration.

## 14. Within

A component declared `within` a host exists only while the host does, whatever removes the host: a command, a rule, a
despawn or another `within`. One added without its host is dropped.

```ts
Component.register(glow, { type: { type: "number" }, within: body });
```

Example: [`13-within.test.ts`](src/guide/13-within.test.ts#L20-L39).

- **Removing a host and adding it back** in the same sync point still ends its dependents. A derived host that a rule keeps never leaves.
- **Rejected:** components within each other in a cycle, at registration.

## 15. Entity references

Entity-valued components and fields use `Entity.schema`. With `reference: "owner"`, a holder is despawned with its
target, transitively, so a hierarchy despawns with its root. With `reference: "weak"`, the component is removed
instead. A reference written to an entity that won't be alive cascades the same way; `Entity.none` names nothing.

```ts
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(watching, { type: Entity.schema, reference: "weak" });
```

Example: [`14-references.test.ts`](src/guide/14-references.test.ts#L22-L43).

- **Only the value a holder ends up with counts:** a reference pointed elsewhere in the same sync point stays.
- **References change only through commands**, which keeps the index from targets to holders exact. `Component.Writable` leaves them out of `query.write`.

## 16. Finalizers

A finalizer runs inside the sync point, on the main thread, for each entity that stops matching its query: one that
matched after the previous sync point and won't after this one, whatever the cause. It reads the entity's values
from before the sync point applies. An entity spawned and despawned in the same sync point never matched, so a
finalizer doesn't run for it, and neither does a change of values alone. It releases what entities hold outside the world,
such as GPU buffers or DOM nodes. Its commands apply at the next sync point; `dispose()` runs it for every entity it
still matches.

```ts
const release = Finalizer.create({ name: "guide/finalizers/release", query: { read: [position, handle] } }, (row, _, commands) => {
    open.delete(row[handle]);
    const [x, y, z] = row[position];
    commands.spawn({ [position]: [x, y, z], [debris]: true });
});
```

Example: [`15-finalizers.test.ts`](src/guide/15-finalizers.test.ts#L31-L69).

- **A stop:** a despawn, the loss of a required component by any cause, a required component removed and added again, or an excluded one added.
- **Rows are read-only.** Lookups see the state before the sync point applies, and resource writes take its tick.
- **Order:** `before` and `after` among finalizers, then registration order. A finalizer that throws doesn't stop the sync point; the run rejects with the first error once it has applied.

## 17. Changes finalizers

A changes finalizer sees a sync point's structural changes to its components, grouped by how entities changed, with
values before and after: for persistence, replication and undo. Without `components`, it sees every component that
isn't derived.

```ts
const save = Finalizer.changes({ name: "guide/changes/save", components: [name, score], resources: { read: [journal], write: [journal] } }, (changes, context) => {
    const lines = changes.groups.flatMap(group => group.entities.map(entity =>
        `${changes.previous(entity, name) ?? changes.next(entity, name)}: +${group.added.length} -${group.removed.length} score ${changes.previous(entity, score)} → ${changes.next(entity, score)}`));
    context[journal] = [...context[journal], ...lines];
});
```

Example: [`16-changes.test.ts`](src/guide/16-changes.test.ts#L35-L51).

- **A group** has `from` and `to` (null for spawned and despawned entities), `added`, `removed`, `replaced` and `entities`.
- **Rejected:** watching a derived component, at registration and in types.

## 18. Loading resources asynchronously

Rules, `within` and finalizers combine into a lifecycle for things that load asynchronously, such as meshes from files:

1. A rule derives a slot for every entity that should have the resource.
2. A system with `added: [slot]` writes a fresh token into each new slot and requests the load.
3. The completed load arrives as its own run, `world.run(apply, { entity, token, handle })`. If the slot's token still matches, it adds the ready component, declared `within` the slot; otherwise the result is stale and is released.
4. When the slot goes, the ready component goes with it, and a finalizer releases what was loaded.

```ts
const apply = System.create({
    name: "guide/loading/apply",
    args: { type: "object", properties: { entity: Entity.schema, token: { type: "integer" }, handle: { type: "integer" } } },
    lookup: { slots: { read: [meshSlot] } },
}, (_, { args, slots }, commands) => {
    if (slots(args.entity)?.[meshSlot] === args.token) commands.add(args.entity, { [meshReady]: args.handle });
    else loaded.delete(args.handle);
});
```

Example: [`17-async-loading.test.ts`](src/guide/17-async-loading.test.ts#L69-L116).

- **Shared assets:** many entities using one file are counted by the loader. The ECS gives each user exactly one acquire (`added`) and one release (a finalizer).

## 19. Reference

- **Built-in components:** `component`, `persistent` and `shared` are tags in [`src/components/`](src/components/).
- **What the types reject:** the type tests pin the contract, and read as contract tests, not samples: [`system.type-test.ts`](src/system/system.type-test.ts), [`world.type-test.ts`](src/world/world.type-test.ts), [`rule.type-test.ts`](src/rule/rule.type-test.ts), [`trait.type-test.ts`](src/trait/trait.type-test.ts).
- **The contract and its reasoning:** [`design.md`](design.md).
- **A complete application:** the [particle sample](src/sample/particles.ts), run by [`particles.test.ts`](src/sample/particles.test.ts), and its [GPU version](src/sample/gpu/).
