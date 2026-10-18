# data-ecs guide

How to use the ECS. Each excerpt comes from a test in this folder; the link under it opens the whole file.

**Basics**

1. [Setup](#1-setup)
2. [Resources](#2-resources)
3. [Entities and components](#3-entities-and-components)
4. [Archetypes](#4-archetypes)
5. [Systems](#5-systems)

**Intermediate**

6. [Scheduling and composites](#6-scheduling-and-composites)
7. [Change filters and conditions](#7-change-filters-and-conditions)
8. [Rules](#8-rules)
9. [Finalizers](#9-finalizers)
10. [Traits](#10-traits)

**Advanced**

11. [Lookups](#11-lookups)
12. [Input](#12-input)
13. [Sync points](#13-sync-points)
14. [Kernels](#14-kernels)
15. [Reductions](#15-reductions)
16. [GPU kernels and render systems](#16-gpu-kernels-and-render-systems)
17. [Within and references](#17-within-and-references)
18. [Hierarchies](#18-hierarchies)
19. [Change sets](#19-change-sets)
20. [Ticks and cadence](#20-ticks-and-cadence)
21. [Identity and ids](#21-identity-and-ids)

## Basics

Resources, values a world holds once, and entities, each holding a set of components, are the whole data model.
Everything after them is about changing that data or constraining it.

### 1. Setup

```ts
// vite.config.ts: compiles kernels, checks each system's declaration against its body, and gives keys and systems ids.
import { kernelPlugin } from "@adobe/data-ecs/compiler";
export default defineConfig({ plugins: [kernelPlugin()] });
```

Types are declared by augmenting `Components`, `Resources` and `Traits` in `@adobe/data-ecs`. The examples create
worlds with `createWorld()`.

### 2. Resources

```ts
export const gravity = Symbol("gravity");

declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: { type: number };
    }
}

// A resource always has a value, so its schema has a default.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });

await using moon = createWorld({ [gravity]: -1.6 });
// Observe.toPromise reads an observer's current value.
expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
```

[`02-resources.test.ts`](02-resources.test.ts#L5-L24)

### 3. Entities and components

```ts
export const position = Symbol("position");
export const enemy = Symbol("enemy");

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        // A tag: present or not, with no value.
        [enemy]: { type: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(enemy, { type: { const: true } });

// Systems spawn entities: name the components, then give their values.
export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn([position])({ [position]: [5, 0, 0] });
});

// Commands also add and remove components, and despawn entities.
export const defeat = System.create({ components: { has: [enemy] } }, (row, { commands }) => {
    commands.remove(row.entity, enemy);
});
```

Observers read entities back:

```ts
await world.run(spawn);
const [foe] = await Observe.toPromise(world.observe.select({ required: [enemy] }));
const values = await Observe.toPromise(world.observe.entity(foe, { required: [position] }));
expect(values?.[position]).toEqual([0, 10, 0]);
expect(await Observe.toPromise(world.observe.count({ required: [position] }))).toBe(2);
```

[`03-entities.test.ts`](03-entities.test.ts#L5-L40)

### 4. Archetypes

```ts
// A list of components, declared once at module scope; it goes wherever a list of components does.
export const Particle = Archetype.create([position, velocity]);

export const emit = System.create(({ commands }) => {
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

expect(await Observe.toPromise(world.observe.count({ required: Particle }))).toBe(1);
```

[`04-archetypes.test.ts`](04-archetypes.test.ts#L18-L29)

### 5. Systems

```ts
// Runs once per entity with every component in read and write, and none in not.
const move = System.create({
    // Optional: labels the system in reports.
    name: "physics/move",
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
// add: runs a system on every tick.
world.add(count);
// An observer is notified when its value changes, at most once per frame.
const ticked = new Promise<number>(resolve => world.observe.resource(frames)(value => { if (value > 0) resolve(value); }));
```

[`05-systems.test.ts`](05-systems.test.ts#L34-L64)

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
// Runs its members as one system, in their order; members with no order between them may run in parallel.
const frame = System.composite({ systems: [heal, hit] });
```

[`06-scheduling.test.ts`](06-scheduling.test.ts#L18-L36)

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
const phased = System.composite({ systems: [report, poison, update, render] });
```

[`06-scheduling.test.ts`](06-scheduling.test.ts#L38-L55)

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

### 8. Rules

```ts
// Only rules add derived components, starting at their default.
Component.register(drawn, { type: { const: true }, derived: true });
Component.register(layer, { type: { type: "number", default: 1 }, derived: true });

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { has: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { has: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { has: [drawn] }, derive: [layer] });
```

[`08-rules.test.ts`](08-rules.test.ts#L24-L50)

### 9. Finalizers

```ts
// Runs for each entity that stops matching, whatever the cause, reading its values from before.
Finalizer.create({ components: { read: [handle] } }, row => {
    open.delete(row[handle]);
});

// dispose runs every finalizer for the entities it still matches.
await world.dispose();
```

[`09-finalizers.test.ts`](09-finalizers.test.ts#L15-L47)

### 10. Traits

```ts
// Traits are the fields of a key's record; type is one. Registration gives them again.
declare module "@adobe/data-ecs" {
    interface Components {
        // Only rules add and remove it.
        [slot]: { type: number; derived: true };
        // Present only while slot is.
        [ready]: { type: number; within: typeof slot };
        // Despawned with the entity it points to ("weak" removes the component instead).
        [parent]: { type: Entity; reference: "owner" };
    }
    interface Resources {
        // Systems contribute to it with this operator.
        [total]: { type: number; reduce: "+" };
    }
}

// A trait of your own is a member of Traits<N>: the value it allows on key N, or never where it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, Keys>, typeof transform>>();
```

[`10-traits.type-test.ts`](10-traits.type-test.ts#L11-L53)

## Advanced

### 11. Lookups

Reading another entity's components by id, from a system. To be written.

### 12. Input

Values passed to a run, as `world.run(system, input)`. To be written.

### 13. Sync points

When commands apply, and as what net effect. To be written.

### 14. Kernels

Systems compiled to run across workers. To be written.

### 15. Reductions

One value computed from many rows. To be written.

### 16. GPU kernels and render systems

Systems that run or draw on the GPU. To be written.

### 17. Within and references

Components that leave with their host or the entity they point to. To be written.

### 18. Hierarchies

Running rows parent first, through a reference. To be written.

### 19. Change sets

Finalizers that see each sync point's changes, for persistence and undo. To be written.

### 20. Ticks and cadence

When added systems run, and the clock they read. To be written.

### 21. Identity and ids

How systems and keys stay the same across reloads. To be written.
