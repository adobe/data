import type { Entity } from '../entity/entity.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const position = 'systemTest/position';
const velocity = 'systemTest/velocity';
const target = 'systemTest/target';
const player = Symbol('systemTest/player');
const time = 'systemTest/time';
const score = 'systemTest/score';

declare module '@adobe/data-ecs' {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
        [target]: { type: Entity };
        [player]: { type: true };
    }
}
const flagged = 'systemTest/flagged';
const bounds = 'systemTest/bounds';
const total = 'systemTest/total';
declare module '@adobe/data-ecs' {
    export interface Resources {
        [time]: { type: number };
        [score]: { type: number };
        [flagged]: { type: boolean; reduce: "|" };
        [bounds]: { type: readonly [number, number, number]; reduce: "min" };
        [total]: { type: number; reduce: "+" };
    }
    export interface Systems {
        "test/draw": true;
        "test/integrate": true;
        "test/follow": true;
        "test/move": true;
        "test/tally": true;
        "test/main": true;
    }
}

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
}, row => { row[position] += 1; });

// Lookups: read-only values by entity, or null.
export const follow = System.create({
    name: "test/follow",
    components: { read: [target, position], write: [velocity] },
    lookup: { targets: { read: [position] } },
    after: ["test/integrate"],
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    if (other !== null) {
        row[velocity] = other[position] - row[position];
        // @ts-expect-error lookup values are read-only
        other[position] = 0;
    }
    // @ts-expect-error a lookup returns null for a missing entity
    void targets(row[target])[position];
});

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
    const spawned: Entity = commands.spawn({ [position]: 0, [player]: true });
    // @ts-expect-error spawn values must match the component type
    commands.spawn({ [position]: "zero" });
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
}, ({ resources }) => { resources[score] += 1; });

System.create({
    name: "test/integrate",
    // @ts-expect-error a system can't be ordered against itself
    before: ["test/integrate"],
}, () => {});

System.create({
    name: "test/integrate",
    // @ts-expect-error ordering names must be registered systems
    after: ["test/unregistered"],
}, () => {});

System.create({
    name: "test/move",
    input: { type: "number" },
    // @ts-expect-error a system with input can't use change filters
    components: { changed: [position] },
}, () => {});

export const main = System.composite({ name: "test/main", systems: [integrate, follow, tally] });

// @ts-expect-error a system with input can't be a composite member
System.composite({ name: "test/main", systems: [move] });

// A system is its name and the input `run` takes with it.
check<Equal<typeof integrate, System<"test/integrate">>>();
check<Equal<typeof move, System<"test/move", { readonly distance: number }>>>();
check<Equal<typeof main, System<"test/main">>>();

const label = 'systemTest/label';
const path = 'systemTest/path';
const vector = 'systemTest/vector';
declare module '@adobe/data-ecs' {
    export interface Components {
        [label]: { type: string };
        [path]: { type: readonly number[] };
        [vector]: { type: readonly [number, number, number] };
    }
}

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
    // @ts-expect-error kernel lookups must read linear values
    lookup: { labels: { read: [label] } },
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
