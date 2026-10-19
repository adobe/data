# data-ecs guide

How to use the ECS. Each excerpt comes from a test in this folder; the link under it opens the whole file.

[Setup](#setup)

**Basics**

1. [Resources](#1-resources)
2. [Entities, components and archetypes](#2-entities-components-and-archetypes)
3. [Systems](#3-systems)
4. [Ticks and cadence](#4-ticks-and-cadence)

**Intermediate**

5. [Scheduling and composites](#5-scheduling-and-composites)
6. [Sync points](#6-sync-points)
7. [Change filters and conditions](#7-change-filters-and-conditions)
8. [Input](#8-input)
9. [Rules](#9-rules)
10. [Finalizers and change sets](#10-finalizers-and-change-sets)
11. [Traits, within and references](#11-traits-within-and-references)

**Advanced**

12. [Lookups](#12-lookups)
13. [Indexes](#13-indexes)
14. [Kernels](#14-kernels)
15. [Reductions](#15-reductions)
16. [GPU kernels and render systems](#16-gpu-kernels-and-render-systems)
17. [Hierarchies](#17-hierarchies)
18. [Identity and ids](#18-identity-and-ids)
19. [Threads](#19-threads)

## Setup

```ts
// vite.config.ts: compiles kernels, checks each system's declaration against its body, and gives keys and systems ids.
import { kernelPlugin } from "@adobe/data-ecs/compiler";
export default defineConfig({ plugins: [kernelPlugin()] });
```

Each component and resource is declared once, by augmenting `Components` or `Resources` in `@adobe/data-ecs` with its
traits, `type` among them, and registered once with the same traits. Registration's types check the two match.
`type` is registered as a JSON Schema for the value, in which `{ type: "set", items }` and
`{ type: "map", keys, values }` describe a `ReadonlySet` and a `ReadonlyMap`. Traits of your own augment `Traits`.
The examples create worlds with `createWorld()`.

## Basics

Resources, values a world holds once, and entities, each holding a set of components, are the whole data model.
Systems change that data, once per run or on every tick.

### 1. Resources

```ts
export const gravity = Symbol("gravity");
export const names = Symbol("names");
export const audio = Symbol("audio");

// Its traits are declared; `type` is the value's type.
declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: { type: number };
        [names]: { type: ReadonlyMap<string, number> };
        [audio]: { type: AudioContext | null };
    }
}

// Registration gives the same traits, with a schema that describes exactly the declared type. A resource always has a
// value: its schema's default, or one beside it.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });
Resource.register(names, { type: { type: "map", keys: { type: "string" }, values: { type: "number" } }, default: new Map() });
// A value that isn't data has no schema and is stored as it is. A type that allows null starts there.
Resource.register(audio, {});

await using moon = createWorld({ [gravity]: -1.6 });
// Observe.toPromise reads an observer's current value.
expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
```

[`01-resources.test.ts`](01-resources.test.ts#L5-L35)

### 2. Entities, components and archetypes

```ts
export const position = Symbol("position");
export const velocity = Symbol("velocity");
export const enemy = Symbol("enemy");

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        // A tag: present or not, with no value.
        [enemy]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });

// An archetype names a list of components, once at module scope; it goes wherever a list of components does.
export const Particle = Archetype.create([position, velocity]);

// Systems spawn entities: name the components, then give their values.
export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

// Commands also add and remove components, and despawn entities.
export const defeat = System.create(
    { components: { has: [enemy] } },
    (row, { commands }) => {
        commands.remove(row.entity, enemy);
    }
);
```

Observers read entities back:

```ts
await world.run(spawn);
const [foe] = await Observe.toPromise(world.observe.select({ required: [enemy] }));
const values = await Observe.toPromise(world.observe.entity(foe, { required: [position] }));
expect(values?.[position]).toEqual([0, 10, 0]);
expect(await Observe.toPromise(world.observe.count({ required: Particle }))).toBe(1);
```

[`02-entities.test.ts`](02-entities.test.ts#L5-L46)

### 3. Systems

```ts
// Runs once per entity with every component in read and write, and none in not.
const move = System.create({
    // Optional: labels the system in reports.
    name: "physics.move",
    components: { read: [velocity], write: [position], not: [frozen] },
    resources: { read: [delta] },
}, (row, { resources }) => {
    // Values are replaced whole, never edited in place.
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// Without components, a system runs once per run.
const count = System.create({ resources: { write: [frames] } }, ({ resources }) => {
    resources[frames] += 1;
});

// run: runs a system once.
await world.run(move);
```

[`03-systems.test.ts`](03-systems.test.ts#L34-L59)

### 4. Ticks and cadence

```ts
// clock is the current tick's: delta is the milliseconds since the last one.
const advance = System.create({ resources: { read: [clock], write: [elapsed] } }, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});

// cadence ticks once per animation frame by default; fixed ticks every step milliseconds, each with that delta.
// A tick runs only after a run arrives, unless always is set.
await using world = createWorld({ [cadence]: { kind: "fixed", step: 10 }, [always]: true });
// add: runs a system on every tick.
world.add(advance);
// An observer is notified when its value changes, at most once per frame.
const ticked = new Promise<number>(resolve => world.observe.resource(elapsed)(value => { if (value >= 30) resolve(value); }));
// remove: takes a system added off every tick again.
world.remove(advance);
```

[`04-ticks.test.ts`](04-ticks.test.ts#L15-L32)

## Intermediate

### 5. Scheduling and composites

```ts
const hit = System.create({ components: { read: [damage], write: [health] } }, row => {
    row[health] -= row[damage];
});
// before, after and during list the systems themselves.
const heal = System.create({ components: { write: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
// A list of systems is a composite: it runs its members as one system, in their order; members without an order
// between them may run in parallel. { systems, after, ... } declares one with a name or constraints.
const frame = System.create([heal, hit]);
```

[`05-scheduling.test.ts`](05-scheduling.test.ts#L18-L37)

```ts
// Phases are systems that do nothing; a system during one runs after what the phase follows and before what follows it.
const update = System.create(() => {});
const render = System.create({ after: [update] }, () => {});
const poison = System.create({ components: { write: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const report = System.create({ components: { read: [health] }, during: [render] }, row => {
    seen.push(row[health]);
});
const phased = System.create([report, poison, update, render]);
```

[`05-scheduling.test.ts`](05-scheduling.test.ts#L39-L56)

### 6. Sync points

```ts
// Value writes apply at once; commands wait for the sync point that ends each run, then apply in the order issued.
const spawn = System.create(({ commands }) => {
    // spawn gives the entity at once, so later commands can name it.
    const hero = commands.spawn([health])({ [health]: 3 });
    commands.add(hero, health, 5);
    // Spawned and despawned before the sync point, it never exists.
    commands.despawn(commands.spawn([health])({ [health]: 1 }));
});
// A composite is one run with one sync point: count runs after spawn, before its entities exist.
const count = System.create({ components: { has: [health] }, resources: { write: [seen] }, after: [spawn] }, (row, { resources }) => {
    resources[seen] += 1;
});
const frame = System.create([spawn, count]);
```

[`06-sync-points.test.ts`](06-sync-points.test.ts#L20-L42)

### 7. Change filters and conditions

```ts
// A resource in changed passes the first run and each run after it changes: no run-once flag needed.
const load = System.create({ resources: { read: [level], changed: [level] } }, ({ resources, commands }) => {
    commands.spawn([score, shown, boss])({ [score]: 0, [shown]: -1 });
    for (let i = 0; i < resources[level]; i++) commands.spawn([score, shown])({ [score]: 0, [shown]: -1 });
});
// A component in changed passes only rows written since this system last ran.
const show = System.create({ components: { read: [score], write: [shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
```

[`07-change-filters.test.ts`](07-change-filters.test.ts#L35-L58)

```ts
// Runs only while each resource in is is neither null nor false, and each in not is; is reads it narrowed.
const step = System.create({ resources: { is: [map], not: [paused], write: [steps] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
```

[`07-change-filters.test.ts`](07-change-filters.test.ts#L60-L75)

### 8. Input

```ts
// input is an object schema of named fields; each run passes a value of it.
const hit = System.create({
    components: { write: [health] },
    input: { type: "object", properties: { amount: { type: "number" } } },
}, (row, { input }) => {
    row[health] -= input.amount;
});

// Systems with input are run, not added; a composite's input has every field its members declare.
await world.run(hit, { amount: 3 });
```

[`08-input.test.ts`](08-input.test.ts#L17-L32)

### 9. Rules

```ts
declare module "@adobe/data-ecs" {
    interface Components {
        // Only rules add derived components, starting at their schema's default.
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true };
    }
}

Component.register(drawn, { type: { const: true }, derived: true });
Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { has: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { has: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { has: [drawn] }, derive: [layer] });
```

[`09-rules.test.ts`](09-rules.test.ts#L10-L50)

### 10. Finalizers and change sets

```ts
// Runs for each entity that stops matching, whatever the cause, reading its values from before.
Finalizer.create({ components: { read: [handle] } }, row => {
    open.delete(row[handle]);
});

// dispose runs every finalizer for the entities it still matches.
await world.dispose();
```

[`10-finalizers.test.ts`](10-finalizers.test.ts#L15-L47)

```ts
// Sees each sync point's structural changes to the components it watches, grouped by how entities changed, with
// values before and after: for saving and undo.
Finalizer.changes({ watch: [handle] }, changes => {
    for (const group of changes.groups) {
        for (const entity of group.entities) saved.push(`${changes.previous(entity, handle)} → ${changes.next(entity, handle)}`);
    }
});
```

[`10-finalizers.test.ts`](10-finalizers.test.ts#L49-L65)

### 11. Traits, within and references

```ts
// Traits are the fields of a key's declaration; type is one. Registration repeats them.
declare module "@adobe/data-ecs" {
    interface Components {
        [ship]: { type: true };
        // Despawned with the entity it points to.
        [parent]: { type: Entity; reference: "owner" };
        // Removed when the entity it points to despawns.
        [target]: { type: Entity; reference: "weak" };
        [selected]: { type: true };
        // Removed with selected.
        [outline]: { type: number; within: typeof selected };
    }
}

Component.register(ship, { type: { const: true } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(target, { type: Entity.schema, reference: "weak" });
Component.register(selected, { type: { const: true } });
Component.register(outline, { type: { type: "number" }, within: selected });

const spawn = System.create(({ commands }) => {
    const mothership = commands.spawn([ship, selected, outline])({ [outline]: 2 });
    commands.spawn([parent])({ [parent]: mothership });
    commands.spawn([target])({ [target]: mothership });
});
```

[`11-traits.test.ts`](11-traits.test.ts#L11-L53)

```ts
// A trait of your own is a member of Traits<N>: the value it allows on key N, or never where it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, typeof transform | typeof name>, typeof transform>>();
```

[`11-traits.type-test.ts`](11-traits.type-test.ts#L6-L27)

## Advanced

### 12. Lookups

Reading another entity's components by id, from a system. To be written.

### 13. Indexes

```ts
// An index finds entities by their components' values: here, those with a crowded count, by their cell.
const grid = Index.create({ key: [cell], components: { has: [crowded] } });

// A lookup through it gives the rows with a key, in entity order.
const count = System.create({ components: { read: [cell], write: [crowded] }, lookup: { at: { index: grid } } }, (row, { lookup }) => {
    const [x, y] = row[cell];
    row[crowded] = lookup.at([x, y]).length;
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L27-L34)

```ts
// A sorted index keeps its key's order: lookups take a range, and `order` runs a system's rows in it.
const byScore = Index.create({ key: [score], sorted: true, components: { has: [player] } });

const winners: string[] = [];
const leaders = System.create({ lookup: { scores: { index: byScore, read: [player] } } }, ({ lookup }) => {
    winners.length = 0;
    const high = lookup.scores({ ">=": 90 });
    for (let i = 0; i < high.length; i++) winners.push(high.at(i)[player]);
});

const board: string[] = [];
const list = System.create({ components: { read: [player] }, order: byScore }, row => {
    board.push(row[player]);
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L36-L49)

```ts
// A unique index gives one row, or null.
const byServerId = Index.create({ key: [serverId], unique: true });
let found: number | null = null;
const find = System.create({ input: { type: "object", properties: { id: { type: "integer" } } }, lookup: { byId: { index: byServerId } } }, ({ input, lookup }) => {
    found = lookup.byId(input.id)?.entity ?? null;
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L51-L56)

A list stays valid until its call site runs again. Lists and rows read only what the index holds and its lookup's
`read` names, and `list.changed` tells whether an entity entered, left or moved in it since the system last ran.

### 14. Kernels

Systems compiled to run across workers. To be written.

### 15. Reductions

One value computed from many rows. To be written.

### 16. GPU kernels and render systems

Systems that run or draw on the GPU. To be written.

### 17. Hierarchies

Running rows parent first, through a reference. To be written.

### 18. Identity and ids

How systems and keys stay the same across reloads. To be written.

### 19. Threads

Sharing a world with another thread, which joins it to run systems and observe. To be written.
