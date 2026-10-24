# ecs guide

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
// vite.config.ts: infers what each system's body reads and writes, compiles kernels, reads the schema of each body's
// input from its type, and gives keys and systems ids.
import { Compiler } from "@adobe/ecs/compiler";
export default defineConfig({ plugins: [Compiler.plugin()] });
```

Each component and resource is declared once, in the module that makes its key, by augmenting `Components` or
`Resources` in `@adobe/ecs` with its traits, `type` among them. The plugin registers each declaration: it reads the
schema the value is stored by from `type`, so a type named by `Schema.Type`, such as `F32` or `U32`, gives its
precision or width. Traits of your own augment `Traits`. While a declaration's trait or default doesn't hold, each
`World.create` call fails to compile, naming the key, the member and what's wrong with it. A library builds with Vite and
`Compiler.plugin({ library: true })`, so its build ships its registrations. Kernels run on workers as separate
chunks, so the plugin sets Vite's `worker.format` to `"es"` when the config doesn't set it, for every worker the app
bundles, its own included, which then load as module workers (`{ type: "module" }`). The examples create worlds with
`World.create()`.

A system declares only what its body can't show: the entities it runs over (`with` and `not`), its change filters
and conditions, and its order. What its body reads, writes and reduces into the plugin infers from the body, so
write the declaration and body where the system is made, and index rows and resources by key.

## Basics

Resources, values a world holds once, and entities, each holding a set of components, are the whole data model.
Systems change that data, once per run or on every tick.

### 1. Resources

```ts
export const gravity = Symbol();
export const floor = Symbol();
export const names = Symbol();
export const audio = Symbol();
export const focused = Symbol();

// A type's namespace may give the value it starts at, which every row and world starting from it shares, so readonly.
export type Height = F32;
export const Height = { default: -Infinity } as const;

// It's declared once, with its traits: `type` is the value's type, and `default` a literal it starts at. Without one,
// it starts at its type's namespace's default, a reduction's identity, null, its zero value (0, false, "", item by
// item), or an empty ReadonlyMap or ReadonlySet of each world's own. The build registers what's declared.
declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: number; default: -9.8 };
        [floor]: { type: Height };
        [names]: { type: ReadonlyMap<string, number> };
        // A value that isn't data, such as a class, is stored as it is; a change inside it is seen once it's written back.
        [audio]: { type: AudioContext | null };
        // Entity.none, 0, rather than null, so an entity stays data every thread reads.
        [focused]: { type: Entity };
    }
}

// Systems read a world: an observer only reads, after the world's changes apply.
let values: readonly [
    Resource.Value<typeof gravity>,
    Resource.Value<typeof floor>,
    Resource.Value<typeof names>,
    Resource.Value<typeof audio>,
    Resource.Value<typeof focused>
] | null = null;
const read = System.create({ observer: true }, ({ resources }) => {
    values = [resources[gravity], resources[floor], resources[names], resources[audio], resources[focused]];
});

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = World.create();
    await using moon = World.create({ [gravity]: -1.6 });
    // run: runs a system once.
    await earth.run(read);
    expect(values).toEqual([-9.8, -Infinity, new Map(), null, Entity.none]);
    await moon.run(read);
    expect(values?.[0]).toBe(-1.6);
```

[`01-resources.test.ts`](01-resources.test.ts#L7-L52)

### 2. Entities, components and archetypes

```ts
export const position = Symbol();
export const velocity = Symbol();
export const enemy = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        // A tag: present or not, with no value.
        [enemy]: { type: true };
    }
}

// An archetype is a list of components declared `as const` at module scope, which the build indexes; it goes wherever
// a list of components does.
export const Particle = [position, velocity] as const;

// Systems spawn entities: name the components, then give their values.
export const spawn = System.create(({ commands }) => {
    commands.spawn([position, enemy])({ [position]: [0, 10, 0] });
    commands.spawn(Particle)({ [position]: [0, 0, 0], [velocity]: [1, 0, 0] });
});

// Commands also add and remove components, and despawn entities.
export const defeat = System.create({ components: { with: [enemy] } }, (row, { commands }) => {
    commands.remove(row.entity, enemy);
});

// An observer system reads them back, once per entity with its components.
const foes: Vec3[] = [];
const readFoes = System.create({ observer: true, components: { with: [position, enemy] } }, row => {
    foes.push(row[position]);
});
let particles = 0;
const countParticles = System.create({ observer: true, components: { with: [...Particle] } }, () => {
    particles += 1;
});

it("spawns entities with components", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(readFoes);
    await world.run(countParticles);
    expect(foes).toEqual([[0, 10, 0]]);
    expect(particles).toBe(1);
```

[`02-entities.test.ts`](02-entities.test.ts#L6-L50)

### 3. Systems

```ts
// Runs once per entity with every component in with, and none in not. What its body reads and writes the build
// infers.
const move = System.create({
    components: { with: [velocity, position], not: [frozen] },
}, (row, { resources }) => {
    // Values are replaced whole, never edited in place.
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// Without components, a system runs once per run.
const count = System.create({}, ({ resources }) => {
    resources[frames] += 1;
});

// An observer system reads what the runs before it left, and changes nothing: run one to read the world, or add one to
// react to it.
const moved: Vec3[] = [];
let counted = 0;
const read = System.create({ observer: true, components: { with: [position], not: [frozen] } }, (row, { resources }) => {
    moved.push(row[position]);
    counted = resources[frames];
});

it("runs a system once per entity, or once", async () => {
    await using world = World.create();
    // run: runs a system once.
    await world.run(spawn);
    await world.run(move);
    await world.run(count);
    await world.run(read);
    expect(moved).toEqual([[1, 0, 0]]);
```

[`03-systems.test.ts`](03-systems.test.ts#L28-L58)

```ts
const fail = System.create(() => {
    throw new Error("broken");
});

// A run resolves to its number. Every run and tick has a report, an entity: `Report.run` says what it ran and how long
// it took, and `Report.errors` is there only when something went wrong. An observer system added to follow errors as
// they change logs them; what observer systems throw is in the next run's report.
const logged: string[] = [];
const logFailures = System.create({ observer: true, components: { with: [Report.errors], changed: [Report.errors] } }, row => {
    for (const failure of row[Report.errors].failures) logged.push(`${failure.name}: ${failure.message}`);
});

it("reports what failed as entities", async () => {
    await using world = World.create();
    world.add(logFailures);
    const run: number = await world.run(fail);
    expect(run).toBe(1);
    expect(logged).toEqual(["fail: broken"]);
```

[`03-systems.test.ts`](03-systems.test.ts#L62-L79)

### 4. Ticks and cadence

```ts
// clock is the current tick's: delta is the milliseconds since the last one.
const advance = System.create({}, ({ resources }) => {
    resources[elapsed] += resources[clock].delta;
});

// Added, an observer system reacts to changes: with elapsed in changed, it runs after each tick that changed it.
let reached: (value: number) => void = () => {};
const watch = System.create({ observer: true, resources: { changed: [elapsed] } }, ({ resources }) => {
    if (resources[elapsed] >= 30) reached(resources[elapsed]);
});

let read = { elapsed: 0, delta: 0 };
const readTime = System.create({ observer: true }, ({ resources }) => {
    read = { elapsed: resources[elapsed], delta: resources[clock].delta };
});

it("runs added systems on every tick", async () => {
    // cadence ticks once per animation frame by default; fixed ticks every step milliseconds, each with that delta.
    // A tick runs only after a run arrives, unless always is set.
    await using world = World.create({ [cadence]: { kind: "fixed", step: 10 }, [always]: true });
    const ticked = new Promise<number>(resolve => { reached = resolve; });
    // add: runs a system on every tick.
    world.add(advance);
    world.add(watch);
    expect(await ticked).toBeGreaterThanOrEqual(30);
    await world.run(readTime);
    expect(read.delta).toBe(10);
    // remove: takes a system added off every tick again.
    world.remove(advance);
```

[`04-ticks.test.ts`](04-ticks.test.ts#L15-L43)

```ts
// A system asks for another tick by contributing a time to wake: the first tick at or after it runs. Work that a tick's
// commands start and a later tick finishes asks for the next one this way.
const step = System.create({}, ({ resources, reduce }) => {
    resources[steps] += 1;
    if (resources[steps] < 3) reduce[wake](resources[clock].now);
});

let finished: (value: number) => void = () => {};
const watchSteps = System.create({ observer: true, resources: { changed: [steps] } }, ({ resources }) => {
    if (resources[steps] === 3) finished(resources[steps]);
});

it("ticks again when a system asks", async () => {
    await using world = World.create({ [cadence]: { kind: "fixed", step: 10 } });
    const done = new Promise<number>(resolve => { finished = resolve; });
    world.add(step);
    world.add(watchSteps);
    // One run arriving ticks once; step's wakes tick twice more.
    await world.run(System.create(() => {}));
```

[`04-ticks.test.ts`](04-ticks.test.ts#L51-L69)

## Intermediate

### 5. Scheduling and composites

```ts
const hit = System.create({ components: { with: [damage, health] } }, row => {
    row[health] -= row[damage];
});
// before, after and during list the systems themselves.
const heal = System.create({ components: { with: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
// A list of systems is a composite: it runs its members as one system, in their order; members without an order
// between them may run in parallel. { systems, after, ... } declares one with constraints.
const frame = System.create([heal, hit]);
```

[`05-scheduling.test.ts`](05-scheduling.test.ts#L16-L25)

```ts
// Phases are systems that do nothing; a system during one runs after what the phase follows and before what follows it.
const update = System.create(() => {});
const render = System.create({ after: [update] }, () => {});
const poison = System.create({ components: { with: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const seen: number[] = [];
const report = System.create({ components: { with: [health] }, during: [render] }, row => {
    seen.push(row[health]);
});
const phased = System.create([report, poison, update, render]);
```

[`05-scheduling.test.ts`](05-scheduling.test.ts#L41-L51)

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
const count = System.create({ components: { with: [health] }, after: [spawn] }, (row, { resources }) => {
    resources[seen] += 1;
});
const frame = System.create([spawn, count]);
```

[`06-sync-points.test.ts`](06-sync-points.test.ts#L17-L29)

```ts
// An observer runs after the sync point of every run and tick it's added to, reading what it left; it writes nothing.
const watch = System.create({ observer: true, components: { with: [health] } }, row => {
    healths.push(row[health]);
});
```

[`06-sync-points.test.ts`](06-sync-points.test.ts#L32-L35)

### 7. Change filters and conditions

```ts
// A resource in changed passes the first run and each run after it changes: no run-once flag needed.
const load = System.create({ resources: { changed: [level] } }, ({ resources, commands }) => {
    commands.spawn([score, shown, boss])({ [score]: 0, [shown]: -1 });
    for (let i = 0; i < resources[level]; i++) commands.spawn([score, shown])({ [score]: 0, [shown]: -1 });
});
// A component in changed passes only rows written since this system last ran.
const show = System.create({ components: { with: [score, shown], changed: [score] } }, row => {
    row[shown] = row[score];
});
```

[`07-change-filters.test.ts`](07-change-filters.test.ts#L27-L35)

```ts
// Runs only while each resource in is is neither null nor false, and each in not is; is reads it narrowed.
const step = System.create({ resources: { is: [map], not: [paused] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
```

[`07-change-filters.test.ts`](07-change-filters.test.ts#L59-L62)

### 8. Input

```ts
// A body's input is its parameter after its context, an object of named fields; each run passes a value of it.
const hit = System.create({
    components: { with: [health] },
}, (row, _context, input: { readonly amount: number }) => {
    row[health] -= input.amount;
});

// target names an input field holding an entity: the system runs on that entity's row alone, or on none once it's gone.
const heal = System.create({
    components: { with: [health] },
    target: "entity",
}, (row, _context, input: { readonly entity: Entity; readonly amount: number }) => {
    row[health] += input.amount;
});

const healths: number[] = [];
const read = System.create({ observer: true, components: { with: [health] } }, row => {
    healths.push(row[health]);
});

it("runs a system with a value", async () => {
    await using world = World.create();
    await world.run(spawn);
    // Systems with input are run, not added; a composite's input has every field its members declare.
    await world.run(hit, { amount: 3 });
    await world.run(heal, { entity: player, amount: 1 });
```

[`08-input.test.ts`](08-input.test.ts#L16-L41)

### 9. Rules

```ts
declare module "@adobe/ecs" {
    interface Components {
        [mesh]: { type: number };
        [sprite]: { type: number };
        [hidden]: { type: true };
        // Only rules add derived components, starting at their default.
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true; default: 1 };
    }
}

// Entities matching a rule have what it derives, only while they match.
Rule.create({ components: { with: [mesh], not: [hidden] }, derive: [drawn] });
// Several rules may derive one component, present while any matches.
Rule.create({ components: { with: [sprite], not: [hidden] }, derive: [drawn] });
// Rules build on what others derive.
Rule.create({ components: { with: [drawn] }, derive: [layer] });
```

[`09-rules.test.ts`](09-rules.test.ts#L11-L27)

### 10. Finalizers and change sets

```ts
// Runs for each entity that stops matching, whatever the cause, reading its values from before.
Finalizer.create({ components: { with: [handle] } }, row => {
    open.delete(row[handle]);
});

const spawn = System.create(({ commands }) => {
    for (const id of [7, 8]) {
        open.add(id);
        commands.spawn([handle])({ [handle]: id });
    }
});
const destroy = System.create({ components: { with: [handle] } }, (row, { commands }) => {
    if (row[handle] === 7) commands.despawn(row.entity);
    else commands.remove(row.entity, handle);
});

it("releases what entities held when they stop matching", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(destroy);
    expect([...open]).toEqual([]);
});

it("releases what every entity holds when the world is disposed", async () => {
    const world = World.create();
    await world.run(spawn);
    // dispose runs every finalizer for the entities it still matches.
    await world.dispose();
```

[`10-finalizers.test.ts`](10-finalizers.test.ts#L16-L43)

```ts
// Sees each sync point's structural changes to the components it watches, grouped by how entities changed, with
// values before and after: for saving and undo.
Finalizer.changes({ watch: [handle] }, changes => {
    for (const group of changes.groups) {
        for (const entity of group.entities) saved.push(`${changes.previous(entity, handle)} → ${changes.next(entity, handle)}`);
    }
});
```

[`10-finalizers.test.ts`](10-finalizers.test.ts#L49-L55)

### 11. Traits, within and references

```ts
// Traits are the fields of a key's declaration; type is one.
declare module "@adobe/ecs" {
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

const spawn = System.create(({ commands }) => {
    const mothership = commands.spawn([ship, selected, outline])({ [outline]: 2 });
    commands.spawn([parent])({ [parent]: mothership });
    commands.spawn([target])({ [target]: mothership });
});
```

[`11-traits.test.ts`](11-traits.test.ts#L11-L29)

```ts
// A trait of your own is a member of Traits<N>: the value it allows on key N, or never where it doesn't apply.
export const instanced = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}

const transform = Symbol();
const name = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [transform]: { type: readonly [number, number, number]; [instanced]: true };
        [name]: { type: string };
    }
}

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, typeof transform | typeof name>, typeof transform>>();
```

[`11-traits.type-test.ts`](11-traits.type-test.ts#L7-L25)

## Advanced

### 12. Lookups

A lookup reads other entities from a system: by id, as here, or by value through an index (next section). It's named in
the declaration and called from the body, it's read-only, and it doesn't change which entities the system runs on.

```ts
// The entity's row, or null when it doesn't have every component in with, or has one in not. The row holds only what
// with lists.
const track = System.create({
    components: { with: [target, aim] },
    lookup: { enemy: { with: [health], not: [frozen] } },
}, (row, { lookup }) => {
    const enemy = lookup.enemy(row[target]);
    row[aim] = enemy === null ? 0 : enemy[health];
});
```

[`12-lookups.test.ts`](12-lookups.test.ts#L19-L27)

```ts
// With changed, its row says whether those components may have changed since the system last ran.
const refreshed: boolean[] = [];
const watch = System.create({
    observer: true,
    components: { with: [target] },
    lookup: { enemy: { with: [health], changed: [health] } },
}, (row, { lookup }) => {
    const enemy = lookup.enemy(row[target]);
    if (enemy !== null) refreshed.push(enemy.changed);
});
```

[`12-lookups.test.ts`](12-lookups.test.ts#L29-L38)

To find entities by their values rather than their ids, look up through an index (next section).

### 13. Indexes

An index is a declared map from component values to the entities holding them, which every world keeps current. A
lookup through it finds entities by value, as a lookup by entity finds one by id.

- A hash index, the default, gives the rows with a key.
- `sorted: true` also takes ranges, and orders a system's rows with `order`.
- `unique: true` gives one row, or null.
- `key: []` holds every entity it matches.

```ts
// Here, entities with a crowded count, by their cell.
const grid = Index.create({ key: [cell], components: { with: [crowded] } });

// A lookup through it gives the rows with a key, in entity order.
const count = System.create({ components: { with: [cell, crowded] }, lookup: { at: { index: grid } } }, (row, { lookup }) => {
    const [x, y] = row[cell];
    row[crowded] = lookup.at([x, y]).length;
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L21-L28)

```ts
// A sorted index keeps its key's order: lookups take a range, and `order` runs a system's rows in it.
const byScore = Index.create({ key: [score], sorted: true, components: { with: [player] } });

const winners: string[] = [];
const leaders = System.create({ observer: true, lookup: { scores: { index: byScore } } }, ({ lookup }) => {
    winners.length = 0;
    const high = lookup.scores({ ">=": 90 });
    for (let i = 0; i < high.length; i++) winners.push(high.at(i)[player]);
});

const board: string[] = [];
const list = System.create({ observer: true, components: { with: [player] }, order: byScore }, row => {
    board.push(row[player]);
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L30-L43)

```ts
// A unique index gives one row, or null.
const byServerId = Index.create({ key: [serverId], unique: true });
let found: number | null = null;
const find = System.create({ lookup: { byId: { index: byServerId } } }, ({ lookup }, input: { readonly id: number }) => {
    found = lookup.byId(input.id)?.entity ?? null;
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L45-L50)

```ts
// An index without a key holds every entity with its components, in entity order. With changed: true, this observer
// system runs only when an entity entered or left the index, so added, it keeps a count as players come and go.
const players = Index.create({ key: [], components: { with: [player] } });
let playerCount = 0;
const countPlayers = System.create({ observer: true, lookup: { players: { index: players, changed: true } } }, ({ lookup }) => {
    playerCount = lookup.players().length;
});
```

[`13-indexes.test.ts`](13-indexes.test.ts#L52-L58)

A list has `length`, `changed` and `at(i)`. It's reused, valid until its call site runs again, each row as long as its
list, and costs only what the body reads. Rows hold what every entity in the index has: its key and its `with`.
`list.changed` says whether an entity entered, left or moved in the list since the system last ran; a lookup's
`changed: true` runs its system only when that happened anywhere in the index.

### 14. Kernels

```ts
// A kernel is a body run once per row, each row on its own, so the world can split rows across workers and run them as
// WASM. A body that reads and writes only structs, calls math and touches no module state is one: the build compiles
// it, with results the same as the body as written.
const move = System.create({ components: { with: [velocity, position] } }, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// kernel: true asserts it: the build fails, saying why, if the body can't be one. It also computes f32 values at f32,
// which is faster on dense rows.
const drift = System.create({ kernel: true, components: { with: [velocity, position] } }, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});

// kernel: false runs the body as written, on its thread: to step through it in a debugger, say.
const slow = System.create({ kernel: false, components: { with: [velocity] } }, row => {
    row[velocity] = Vec3.scale(row[velocity], 0.5);
});
```

[`14-kernels.test.ts`](14-kernels.test.ts#L19-L35)

### 15. Reductions

```ts
declare module "@adobe/ecs" {
    interface Components {
        [mass]: { type: F32 };
    }
    // A reduced resource names how contributions combine: "+", "*", "min", "max", or bitwise "&", "|", "^".
    interface Resources {
        [total]: { type: number; reduce: "+" };
        [heaviest]: { type: F32; reduce: "max" };
        [count]: { type: number; reduce: "+" };
    }
}
```

[`15-reductions.test.ts`](15-reductions.test.ts#L10-L20)

```ts
// Each row contributes; every run starts each resource it reduces at its operator's identity and leaves it holding the
// fold of what every row gave, however the rows were split across workers.
const weigh = System.create({ components: { with: [mass] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
    reduce[heaviest](row[mass]);
    reduce[count](1);
});

// Read the result after the run, as any resource.
let summary = "";
const report = System.create({ observer: true }, ({ resources }) => {
    summary = `${resources[count]} weigh ${resources[total]}, at most ${resources[heaviest]}`;
});
```

[`15-reductions.test.ts`](15-reductions.test.ts#L22-L34)

### 16. GPU kernels and render systems

```ts
// kernel: "gpu" runs the body as a compute shader over the GPU's copy of its components, in a world given a device
// (World.create({ [gpuDevice]: device })), and as a kernel on the CPU in one without. Its rows hold 32-bit numbers
// and vectors of them; it has no lookups, change filters or commands.
const move = System.create({ kernel: "gpu", components: { with: [velocity, position] } }, row => {
    row[position] = Vec2.add(row[position], row[velocity]);
});
```

[`16-gpu.test.ts`](16-gpu.test.ts#L17-L22)

```ts
// A render system records draws over the GPU copy of the components its accessors name, in a world with a device.
// Gpu.wgsl(draw) gives its shaders a function per accessor, `fn dotPosition(row: u32) -> vec2<f32>`, and
// Gpu.layout(device) the bind group layout its pipeline takes. Each table is a group of matching rows to draw.
let pipeline: GPURenderPipeline | null = null;
let target: GPUTextureView | null = null;
const draw = System.render({ shader: { accessors: { dotPosition: position, dotSize: size } } }, ({ encoder, tables }) => {
    if (pipeline === null || target === null) return;
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: "clear", storeOp: "store" }] });
    pass.setPipeline(pipeline);
    for (const table of tables) {
        table.bind(pass);
        pass.draw(6, table.count);
    }
    pass.end();
});
const shaderCode = Gpu.wgsl(draw);
```

[`16-gpu.test.ts`](16-gpu.test.ts#L24-L39)

### 17. Hierarchies

```ts
declare module "@adobe/ecs" {
    interface Components {
        // Despawned with its parent.
        [parent]: { type: Entity; reference: "owner" };
        [offset]: { type: number };
        [placed]: { type: number };
        [label]: { type: string };
    }
}

// up runs rows parent first, through a reference, so each row reads its parent's values from earlier in the same run:
// context.up holds what the body reads of the parent, or null for a row without one.
const place = System.create({ components: { with: [offset, placed] }, up: { through: parent } }, (row, { up }) => {
    row[placed] = (up === null ? 0 : up[placed]) + row[offset];
});
```

[`17-hierarchies.test.ts`](17-hierarchies.test.ts#L10-L24)

### 18. Identity and ids

```ts
// A key, system, index, rule or finalizer is the value its constructor returns: two written alike are two, and code
// written apart can't collide. The build gives each one bound at a module's top level an id from where it's declared,
// its package's name and version, its module's path and its binding, so other threads and a module evaluated again
// by hot reload name the same one.
const explode = System.create(() => {
    throw new Error("boom");
});

// Reports label it by its binding, and give the id beside it to tell two of one label apart.
const failures: string[] = [];
const logFailures = System.create({ observer: true, components: { with: [Report.errors], changed: [Report.errors] } }, row => {
    for (const failure of row[Report.errors].failures) failures.push(`${failure.name} ${failure.id}`);
});
```

[`18-identity.test.ts`](18-identity.test.ts#L5-L17)

### 19. Threads

```ts
// A logical thread is where objects live and the code touching them runs. Declare one, and place objects on it.
declare module "@adobe/ecs" {
    interface Threads {
        audio: true;
    }
    interface Components {
        [volume]: { type: number };
    }
    interface Resources {
        [levels]: { type: ReadonlyMap<string, number>; thread: "audio" };
    }
}

// A system runs on the thread its objects live on: this one, writing levels, runs on audio.
const mix = System.create({ components: { with: [volume] } }, (row, { resources }) => {
    resources[levels] = new Map([...resources[levels], [`voice ${row.entity}`, row[volume]]]);
});

// Another thread joins a shared world, claiming the threads it fills, and adds observer systems that run there after
// the world's sync points.
const heard: number[] = [];
const listen = System.create({ observer: true }, ({ resources }) => {
    heard.push(resources[levels].size);
});
```

[`19-threads.test.ts`](19-threads.test.ts#L8-L31)

```ts
const spawn = System.create(({ commands }) => {
    commands.spawn([volume])({ [volume]: 0.8 });
    commands.spawn([volume])({ [volume]: 0.3 });
});

/** Waits a turn of the event loop at a time until `done`. */
const until = async (done: () => boolean): Promise<void> => {
    while (!done()) await new Promise(resolve => setTimeout(resolve, 1));
};

it("shares a world with another thread", async () => {
    // Usually one end of the channel goes to a worker, `new Worker(...)`, which joins with the other.
    const channel = new MessageChannel();
    await using world = World.create();
    world.share(channel.port1);
    await using audio = World.join(channel.port2, { threads: ["audio"] });
    audio.add(listen);
    await world.run(spawn);
    // A joined world runs systems as the world does.
    await audio.run(mix);
    await until(() => heard.at(-1) === 2);
    expect(heard.at(-1)).toBe(2);
});
```

[`19-threads.test.ts`](19-threads.test.ts#L33-L55)
