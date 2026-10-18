# data-ecs guide

How to use the ECS. Each excerpt comes from a test in this folder; the link under it opens the whole file.

**Basics**

1. [Setup](#1-setup)
2. [Resources](#2-resources)
3. [Entities, components and archetypes](#3-entities-components-and-archetypes)
4. [Systems](#4-systems)
5. [Ticks and cadence](#5-ticks-and-cadence)

**Intermediate**

6. [Scheduling and composites](#6-scheduling-and-composites)
7. [Sync points](#7-sync-points)
8. [Change filters and conditions](#8-change-filters-and-conditions)
9. [Input](#9-input)
10. [Rules](#10-rules)
11. [Finalizers and change sets](#11-finalizers-and-change-sets)
12. [Traits, within and references](#12-traits-within-and-references)

**Advanced**

13. [Lookups](#13-lookups)
14. [Kernels](#14-kernels)
15. [Reductions](#15-reductions)
16. [GPU kernels and render systems](#16-gpu-kernels-and-render-systems)
17. [Hierarchies](#17-hierarchies)
18. [Identity and ids](#18-identity-and-ids)
19. [Threads](#19-threads)

## Basics

Resources, values a world holds once, and entities, each holding a set of components, are the whole data model.
Systems change that data, once per run or on every tick.

### 1. Setup

```ts
// vite.config.ts: compiles kernels, checks each system's declaration against its body, and gives keys and systems ids.
import { kernelPlugin } from "@adobe/data-ecs/compiler";
export default defineConfig({ plugins: [kernelPlugin()] });
```

Each component and resource is registered once, and its type is declared by augmenting `Components` or `Resources`
in `@adobe/data-ecs` with what registration returns; traits of your own augment `Traits`. The examples create worlds
with `createWorld()`.

### 2. Resources

```ts
export const gravity = Symbol("gravity");
export const names = Symbol("names");

// Registration returns the key's traits, its type the one its schema describes. A resource always has a value, so
// its schema has a default.
const gravityTraits = Resource.register(gravity, { type: { type: "number", default: -9.8 } });
// A value that isn't data, such as a Map or a DOM node, states its type, and a resource's default is beside it.
const namesTraits = Resource.register(names, { type: Resource.object<Map<string, number>>(), default: new Map() });

// The types come from those traits.
declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: typeof gravityTraits;
        [names]: typeof namesTraits;
    }
}

await using moon = createWorld({ [gravity]: -1.6 });
// Observe.toPromise reads an observer's current value.
expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
```

[`02-resources.test.ts`](02-resources.test.ts#L5-L31)

### 3. Entities, components and archetypes

```ts
export const position = Symbol("position");
export const velocity = Symbol("velocity");
export const enemy = Symbol("enemy");

const positionTraits = Component.register(position, { type: Vec3.schema });
const velocityTraits = Component.register(velocity, { type: Vec3.schema });
// A tag: present or not, with no value.
const enemyTraits = Component.register(enemy, { type: { const: true } });

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
        [enemy]: typeof enemyTraits;
    }
}

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

[`03-entities.test.ts`](03-entities.test.ts#L5-L46)

### 4. Systems

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

[`04-systems.test.ts`](04-systems.test.ts#L34-L59)

### 5. Ticks and cadence

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
```

[`05-ticks.test.ts`](05-ticks.test.ts#L15-L30)

## Intermediate

### 6. Scheduling and composites

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

[`06-scheduling.test.ts`](06-scheduling.test.ts#L18-L37)

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

[`06-scheduling.test.ts`](06-scheduling.test.ts#L39-L56)

### 7. Sync points

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

[`07-sync-points.test.ts`](07-sync-points.test.ts#L20-L42)

### 8. Change filters and conditions

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

[`08-change-filters.test.ts`](08-change-filters.test.ts#L35-L58)

```ts
// Runs only while each resource in is is neither null nor false, and each in not is; is reads it narrowed.
const step = System.create({ resources: { is: [map], not: [paused], write: [steps] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
```

[`08-change-filters.test.ts`](08-change-filters.test.ts#L60-L75)

### 9. Input

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

[`09-input.test.ts`](09-input.test.ts#L17-L32)

### 10. Rules

```ts
// Only rules add derived components, starting at their default.
const drawnTraits = Component.register(drawn, { type: { const: true }, derived: true });
const layerTraits = Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { has: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { has: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { has: [drawn] }, derive: [layer] });
```

[`10-rules.test.ts`](10-rules.test.ts#L14-L50)

### 11. Finalizers and change sets

```ts
// Runs for each entity that stops matching, whatever the cause, reading its values from before.
Finalizer.create({ components: { read: [handle] } }, row => {
    open.delete(row[handle]);
});

// dispose runs every finalizer for the entities it still matches.
await world.dispose();
```

[`11-finalizers.test.ts`](11-finalizers.test.ts#L15-L47)

```ts
// Sees each sync point's structural changes to the components it watches, grouped by how entities changed, with
// values before and after: for saving and undo.
Finalizer.changes({ watch: [handle] }, changes => {
    for (const group of changes.groups) {
        for (const entity of group.entities) saved.push(`${changes.previous(entity, handle)} → ${changes.next(entity, handle)}`);
    }
});
```

[`11-finalizers.test.ts`](11-finalizers.test.ts#L49-L65)

### 12. Traits, within and references

```ts
// Traits are the fields of a key's declaration; type is one.
const shipTraits = Component.register(ship, { type: { const: true } });
// Despawned with the entity it points to.
const parentTraits = Component.register(parent, { type: Entity.schema, reference: "owner" });
// Removed when the entity it points to despawns.
const targetTraits = Component.register(target, { type: Entity.schema, reference: "weak" });
const selectedTraits = Component.register(selected, { type: { const: true } });
// Removed with selected.
const outlineTraits = Component.register(outline, { type: { type: "number" }, within: selected });

const spawn = System.create(({ commands }) => {
    const mothership = commands.spawn([ship, selected, outline])({ [outline]: 2 });
    commands.spawn([parent])({ [parent]: mothership });
    commands.spawn([target])({ [target]: mothership });
});
```

[`12-traits.test.ts`](12-traits.test.ts#L11-L53)

```ts
// A trait of your own is a member of Traits<N, E>: the value it allows on key N, whose traits are E, or never where
// it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N, E> {
        readonly [instanced]: N extends Component.Key ? ([E["type"]] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, typeof transform | typeof name>, typeof transform>>();
```

[`12-traits.type-test.ts`](12-traits.type-test.ts#L6-L28)

## Advanced

### 13. Lookups

Reading another entity's components by id, from a system. To be written.

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
