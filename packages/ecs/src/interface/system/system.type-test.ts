import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { System } from './system.js';
import type { Index } from '../indexes/index-type.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

export const position = Symbol("systemTest/position");
const velocity = Symbol("systemTest/velocity");
const target = Symbol("systemTest/target");
const player = Symbol('systemTest/player');
export const time = Symbol("systemTest/time");
const score = Symbol("systemTest/score");

declare module '@adobe/ecs' {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
        [target]: { type: Entity };
        [player]: { type: true };
    }
}
Component.register(position, { type: { type: "number" } });
Component.register(velocity, { type: { type: "number" } });
Component.register(target, { type: Entity.schema });
Component.register(player, { type: { const: true } });
const flagged = Symbol("systemTest/flagged");
const bounds = Symbol("systemTest/bounds");
export const total = Symbol("systemTest/total");
declare module '@adobe/ecs' {
    export interface Resources {
        [time]: { type: number };
        [score]: { type: number };
        [flagged]: { type: boolean; reduce: "|" };
        [bounds]: { type: readonly [number, number, number]; reduce: "min" };
        [total]: { type: number; reduce: "+" };
    }
}
Resource.register(bounds, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3, default: [Infinity, Infinity, Infinity] }, reduce: "min" });
Resource.register(time, { type: { type: "number", default: 0 } });
Resource.register(score, { type: { type: "number", default: 0 } });
Resource.register(flagged, { type: { type: "boolean", default: false }, reduce: "|" });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });

// Row: read values are read-only, write values writable, others absent.
export const integrate = System.create({
    name: "test/integrate",
    components: { read: [velocity], write: [position], has: [player] },
    resources: { read: [time] },
}, (row, { resources: { [time]: delta } }) => {
    row[position] += row[velocity] * delta;
    const entity: Entity = row.entity;
    // @ts-expect-error read values are read-only
    row[velocity] = 0;
    // @ts-expect-error entity is read-only
    row.entity = entity;
    // @ts-expect-error components outside read and write are not in the row
    void row[player];
});

// Write grants read: a component in write is readable, and listing it in read as well is rejected.
System.create({
    name: "test/integrate",
    // @ts-expect-error write already makes it readable
    components: { read: [position], write: [position] },
}, () => {});

// Lookups: read-only values by entity, or null.
export const follow = System.create({
    name: "test/follow",
    components: { read: [target, position], write: [velocity] },
    lookup: { targets: { read: [position] } },
    after: [integrate],
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    if (other !== null) {
        row[velocity] = other[position] - row[position];
        // @ts-expect-error lookup values are read-only
        other[position] = 0;
    }
    // @ts-expect-error a lookup returns null for a missing entity
    void targets(row[target])[position];
    // @ts-expect-error a lookup without changed has no changed
    void targets(row[target])?.changed;
});

// A lookup by entity with `changed`: its row also says whether what `changed` names may have changed since the system
// last ran.
System.create({
    name: "test/followChanged",
    components: { read: [target], write: [velocity] },
    lookup: { targets: { read: [position], changed: [position] }, players: { has: [player], changed: [player] } },
}, (row, { lookup: { targets, players } }) => {
    const other = targets(row[target]);
    if (other !== null) {
        check<Equal<typeof other.changed, boolean>>();
        check<Equal<typeof other[typeof position], number>>();
        // @ts-expect-error changed is read-only
        other.changed = false;
    }
    const found = players(row[target]);
    if (found !== null) check<Equal<typeof found, { readonly changed: boolean }>>();
});

System.create({
    name: "test/followChanged",
    components: { read: [target], write: [velocity] },
    // @ts-expect-error a lookup by entity's changed names what it reads or has
    lookup: { targets: { read: [position], changed: [velocity] } },
}, () => {});

// Input: typed from its schema.
export const move = System.create({
    name: "test/move",
    input: { type: "object", properties: { distance: { type: "number" } } },
    components: { has: [player], write: [position] },
}, (row, { input }) => {
    row[position] += input.distance;
    // @ts-expect-error input has its schema's type
    void input.missing;
});

// A system without components takes only its context; resource writes are writable, and written ones readable.
export const tally = System.create({
    name: "test/tally",
    resources: { read: [time], write: [score] },
}, ({ resources, commands }) => {
    resources[score] += resources[time];
    // @ts-expect-error read resources are read-only
    resources[time] = 0;
    const spawned: Entity = commands.spawn([position, player])({ [position]: 0, [player]: true });
    // @ts-expect-error spawn values must match the component type
    commands.spawn([position])({ [position]: "zero" });
    commands.remove(spawned, velocity);
});

// The context holds only what the declaration declares.
System.create({ name: "test/tally" }, context => {
    // @ts-expect-error no resources declared
    void context.resources;
    // @ts-expect-error no lookups declared
    void context.lookup;
    // @ts-expect-error no reductions declared
    void context.reduce;
    // @ts-expect-error no input declared
    void context.input;
    void context.commands;
});

// @ts-expect-error a system without components has no row
System.create({ name: "test/tally" }, (row: object, context: object) => { void [row, context]; });

System.create({
    name: "test/tally",
    // @ts-expect-error write already makes a resource readable
    resources: { read: [score], write: [score] },
}, () => {});

System.create({
    name: "test/integrate",
    // @ts-expect-error ordering takes systems
    after: ["test/unregistered"],
}, () => {});

System.create({
    name: "test/move",
    input: { type: "object", properties: { distance: { type: "number" } } },
    // @ts-expect-error a system with input can't use change filters
    components: { changed: [position] },
}, () => {});

export const main = System.create({ name: "test/main", systems: [integrate, follow, tally] });
const moving = System.create({ name: "test/moving", systems: [move] });

// A composite takes its members' input.
check<Equal<typeof moving, System<{ readonly distance: number }>>>();

// A system is its name and the input `run` takes with it.
check<Equal<typeof integrate, System>>();
check<Equal<typeof move, System<{ readonly distance: number }>>>();
check<Equal<typeof main, System>>();

const label = Symbol("systemTest/label");
const path = Symbol("systemTest/path");
const vector = Symbol("systemTest/vector");
const marks = Symbol("systemTest/marks");
declare module '@adobe/ecs' {
    export interface Components {
        [label]: { type: string };
        [path]: { type: readonly number[] };
        [vector]: { type: readonly [number, number, number] };
        [marks]: { type: ReadonlySet<number> };
    }
}
Component.register(label, { type: { type: "string" } });
Component.register(marks, { type: { type: "set", items: { type: "number" } } });
Component.register(path, { type: { type: "array", items: { type: "number" } } });
Component.register(vector, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } });

// Kernels: linear values (numbers, booleans, entities, fixed tuples), read-only resources.
System.create({
    name: "test/integrate",
    kernel: "cpu",
    components: { read: [velocity, vector, player, target], write: [position], has: [label] },
    resources: { read: [time] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel values must be linear
    components: { read: [label] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel values can't be variable-length arrays
    components: { write: [path] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel values can't be sets or maps
    components: { read: [marks] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel lookups must read linear values
    lookup: { labels: { read: [label] } },
}, () => {});

declare const byTarget: Index<{ readonly key: readonly [typeof target] }>;

// A kernel's lookup by entity matches has and not, as any system's does.
System.create({
    name: "test/followPlayers",
    kernel: "cpu",
    components: { read: [target], write: [position] },
    lookup: { players: { read: [position], has: [player], not: [velocity] } },
}, (row, { lookup }) => {
    const found = lookup.players(row[target]);
    if (found !== null) row[position] = found[position];
});

System.create({
    name: "test/followPlayers",
    kernel: "cpu",
    // @ts-expect-error an index lookup matches what its index holds, so it takes no has
    lookup: { byTarget: { index: byTarget, read: [position], has: [player] } },
}, () => {});

System.create({
    name: "test/tally",
    kernel: "cpu",
    // @ts-expect-error kernels can't write resources
    resources: { write: [score] },
}, () => {});

// GPU kernels: everything kernels can't do, and no lookups, change filters or commands.
System.create({
    name: "test/integrate",
    kernel: "gpu",
    components: { read: [velocity], write: [position] },
    resources: { read: [time] },
}, row => {
    row[position] = row[velocity];
});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    // @ts-expect-error GPU kernel values must be linear too
    components: { read: [label] },
}, () => {});

System.create({
    name: "test/follow",
    kernel: "gpu",
    components: { read: [target], write: [position] },
    // @ts-expect-error GPU kernels can't use lookups
    lookup: { targets: { read: [position] } },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    // @ts-expect-error GPU kernels can't use change filters
    components: { write: [position], changed: [velocity] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    components: { read: [velocity], write: [position] },
}, (row, context) => {
    // @ts-expect-error GPU kernels can't issue commands
    context.commands.despawn(row.entity);
});

System.create({
    name: "test/integrate",
    // @ts-expect-error a kernel is "cpu" or "gpu"
    kernel: true,
}, () => {});

// Reductions: each reduced resource is a function contributing a value of its type, with its trait's operator repeated.
System.create({
    name: "test/tally",
    components: { read: [velocity, vector], changed: [velocity] },
    reduce: { [total]: "+", [bounds]: "min", [flagged]: "|" },
}, (row, { reduce }) => {
    reduce[total](row[velocity]);
    reduce[bounds](row[vector]);
    reduce[flagged](row[velocity] > 1);
    // @ts-expect-error a contribution has the resource's type
    reduce[bounds](1);
    // @ts-expect-error a reduced resource can't be read
    void (reduce[total] + 1);
});

System.create({
    name: "test/tally",
    // @ts-expect-error the operator must equal the resource's reduce trait
    reduce: { [total]: "max" },
}, () => {});

System.create({
    name: "test/tally",
    // @ts-expect-error only resources with a reduce trait can be reduced
    reduce: { [score]: "+" },
}, () => {});

System.create({
    name: "test/tally",
    // @ts-expect-error a reduced resource is never written
    resources: { write: [total] },
}, () => {});

System.create({
    name: "test/tally",
    // @ts-expect-error a contributor doesn't read what it reduces into
    resources: { read: [total] },
    reduce: { [total]: "+" },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    components: { read: [velocity] },
    // @ts-expect-error GPU kernels can't reduce yet
    reduce: { [total]: "+" },
}, () => {});


// Render systems: the accessors name the components they read.
System.render({ name: "test/draw", components: { has: [player] }, resources: { read: [time] }, shader: { accessors: { place: position, speed: velocity } } }, (gpu, { resources }) => {
    void [gpu.encoder, resources[time]];
});
System.render({ name: "test/draw", shader: { accessors: { place: position } } }, (_, context) => {
    // @ts-expect-error a render body issues no commands
    void context.commands;
});
System.render({
    name: "test/draw",
    // @ts-expect-error a render system reads the components its accessors name
    components: { read: [position] },
    shader: { accessors: { place: position } },
}, () => {});

// Names are optional: a declaration may leave it out, and a system that declares nothing is just its body.
export const unnamed = System.create({ components: { write: [position] }, resources: { read: [time] } }, (row, { resources }) => {
    row[position] += resources[time];
});
check<Equal<typeof unnamed, System>>();
export const unnamedInput = System.create({ input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input }) => {
    const count: number = input.count;
    void count;
});
check<Equal<typeof unnamedInput, System<{ readonly count: number }>>>();
export const bodyOnly = System.create(({ commands }) => {
    commands.spawn([position])({ [position]: 0 });
});
check<Equal<typeof bodyOnly, System>>();
// @ts-expect-error a body alone declares no resources
System.create(({ resources }) => { void resources; });
// @ts-expect-error a body alone runs once per run, so it has no row
System.create((row: { readonly entity: Entity }) => { void row; });
export const unnamedAll = System.create([unnamed, bodyOnly]);
check<Equal<typeof unnamedAll, System>>();
System.render({ shader: { accessors: { place: position } } }, gpu => { void gpu.encoder; });

// Observer systems read what a sync point left, after it: rows, resources, lookups and change filters, and no commands.
export const watchPositions = System.create({
    name: "test/watchPositions",
    observer: true,
    components: { read: [position], changed: [position] },
    resources: { read: [time] },
    lookup: { targets: { read: [velocity] } },
}, (row, context) => {
    const read: number = row[position] + context.resources[time];
    void [read, context.lookup.targets(row.entity)];
    // @ts-expect-error an observer system reads only
    row[position] = 0;
    // @ts-expect-error an observer system issues no commands
    void context.commands;
});
check<Equal<typeof watchPositions, System>>();
export const watchTime = System.create({ observer: true, resources: { read: [time], changed: [time] } }, ({ resources }) => { void resources[time]; });
// A composite may hold observer members, which run after its sync point.
export const withWatch = System.create([integrate, watchTime]);
check<Equal<typeof withWatch, System>>();
// @ts-expect-error observer is true or left out
System.create({ observer: false, resources: { read: [time] } }, () => {});
// @ts-expect-error an observer system writes no components
System.create({ observer: true, components: { write: [position] } }, () => {});
// @ts-expect-error an observer system writes no resources
System.create({ observer: true, resources: { write: [score] } }, () => {});
// @ts-expect-error an observer system reduces into nothing
System.create({ observer: true, components: { read: [velocity] }, reduce: { [total]: "+" } }, () => {});
// @ts-expect-error an observer system takes no input
System.create({ observer: true, input: { type: "object", properties: { count: { type: "integer" } } } }, () => {});
// @ts-expect-error an observer system isn't a kernel
System.create({ observer: true, kernel: "cpu", components: { read: [position] } }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, resources: { read: [time] }, after: [integrate] }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, resources: { read: [time] }, before: [integrate] }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, resources: { read: [time] }, during: [integrate] }, () => {});

// A system on one entity: its input names the entity, and its body runs on that entity's row.
const onOne = { type: "object", properties: { entity: Entity.schema, by: { type: "number" } } } as const;
export const nudge = System.create({ input: onOne, target: "entity", components: { write: [position] } }, (row, { input }) => {
    row[position] += input.by;
});
// @ts-expect-error its target is an entity field of its input
System.create({ input: onOne, target: "by", components: { write: [position] } }, () => {});
// @ts-expect-error it runs on a row, so it needs components
System.create({ input: onOne, target: "entity" }, () => {});
// @ts-expect-error not a kernel
System.create({ input: onOne, target: "entity", kernel: "cpu", components: { write: [position] } }, () => {});
