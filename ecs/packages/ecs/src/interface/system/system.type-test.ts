// © 2026 Adobe. MIT License. See /LICENSE for details.
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
const owner = Symbol("systemTest/owner");
export const time = Symbol("systemTest/time");
const score = Symbol("systemTest/score");

declare module '@adobe/ecs' {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
        [target]: { type: Entity };
        [player]: { type: true };
        [owner]: { type: Entity; reference: "owner" };
    }
}
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

// Row: the values of what `with` requires, writable; what the body reads and writes the build infers.
export const integrate = System.create({
    components: { with: [velocity, position, player] },
}, (row, { resources: { [time]: delta } }) => {
    row[position] += row[velocity] * delta;
    const entity: Entity = row.entity;
    // @ts-expect-error entity is read-only
    row.entity = entity;
    void row[player];
});

System.create({ components: { with: [position] } }, row => {
    // @ts-expect-error components outside with are not in the row
    void row[velocity];
});

System.create({
    // @ts-expect-error what the body reads and writes isn't declared
    components: { read: [position] },
}, () => {});

// A reference changes only through commands, so the row holds it read-only.
System.create({ components: { with: [owner] } }, row => {
    // @ts-expect-error a reference is read-only in a row
    row[owner] = Entity.none;
});

// Lookups: read-only values by entity, or null.
export const follow = System.create({
    components: { with: [target, position, velocity] },
    lookup: { targets: { with: [position] } },
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
    components: { with: [target, velocity] },
    lookup: { targets: { with: [position], changed: [position] }, players: { with: [player], changed: [player] } },
}, (row, { lookup: { targets, players } }) => {
    const other = targets(row[target]);
    if (other !== null) {
        check<Equal<typeof other.changed, boolean>>();
        check<Equal<typeof other[typeof position], number>>();
        // @ts-expect-error changed is read-only
        other.changed = false;
    }
    const found = players(row[target]);
    if (found !== null) check<Equal<typeof found, { readonly [player]: true; readonly changed: boolean }>>();
});

System.create({
    components: { with: [target, velocity] },
    // @ts-expect-error a lookup by entity's changed names what its with requires
    lookup: { targets: { with: [position], changed: [velocity] } },
}, () => {});

// Input: the type of the body's parameter after its context.
export const move = System.create({
    components: { with: [position, player] },
}, (row, _context, input: { readonly distance: number }) => {
    row[position] += input.distance;
    // @ts-expect-error input has the type the body gives it
    void input.missing;
});
// The row is still typed by the declaration, and the context holds every resource.
System.create({ components: { with: [velocity, position] } }, (row, { resources }, input: { readonly by: number }) => {
    row[position] += row[velocity] * resources[time] * input.by;
    // @ts-expect-error components outside with are not in the row
    void row[player];
    void resources[score];
});
// @ts-expect-error input is the body's parameter, not part of its declaration
System.create({ input: { type: "object", properties: {} } }, () => {});

// A system without components takes only its context, which holds every resource, writable but those reduced.
export const tally = System.create({}, ({ resources, commands }) => {
    resources[score] += resources[time];
    // @ts-expect-error a reduced resource is never written
    resources[total] = 0;
    const spawned: Entity = commands.spawn([position, player])({ [position]: 0, [player]: true });
    // @ts-expect-error spawn values must match the component type
    commands.spawn([position])({ [position]: "zero" });
    commands.remove(spawned, velocity);
});

// The context holds every resource and reduction, and the lookups the declaration declares.
System.create({}, context => {
    void context.resources;
    void context.reduce;
    // @ts-expect-error no lookups declared
    void context.lookup;
    // @ts-expect-error input isn't in the context
    void context.input;
    void context.commands;
});

// A system without components has no row: its second parameter is its input.
check<Equal<typeof alone, System<{ readonly count: number }>>>();
const alone = System.create({}, (_context, input: { readonly count: number }) => { void input.count; });

System.create({
    // @ts-expect-error ordering takes systems
    after: ["test/unregistered"],
}, () => {});

// @ts-expect-error a system with input can't use change filters
System.create({ components: { changed: [position] } }, (_row, _context, input: { readonly distance: number }) => { void input; });
// @ts-expect-error a system with input can't use change filters
System.create({ components: { added: [position] } }, (_row, _context, input: { readonly distance: number }) => { void input; });
System.create({ components: { changed: [position] } }, row => { void row; });

export const main = System.create({ systems: [integrate, follow, tally] });
const moving = System.create({ systems: [move] });

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

// Kernels: a kernel's `with` may require any component; what its body reads must be linear, which the build checks.
System.create({
    kernel: true,
    components: { with: [velocity, vector, player, target, position, label, path, marks] },
}, row => {
    row[position] = row[velocity];
});

declare const byTarget: Index<{ readonly key: readonly [typeof target] }>;

// A kernel's lookup by entity matches has and not, as any system's does.
System.create({
    kernel: true,
    components: { with: [target, position] },
    lookup: { players: { with: [position, player], not: [velocity] } },
}, (row, { lookup }) => {
    const found = lookup.players(row[target]);
    if (found !== null) row[position] = found[position];
});

System.create({
    kernel: true,
    components: { with: [velocity] },
    // @ts-expect-error an index lookup matches what its index holds, so it takes no with
    lookup: { byTarget: { index: byTarget, with: [player] } },
}, () => {});

System.create({
    kernel: true,
    components: { with: [velocity] },
}, () => {});

// GPU kernels: everything kernels can't do, and no lookups, change filters or commands.
System.create({
    kernel: "gpu",
    components: { with: [velocity, position] },
}, row => {
    row[position] = row[velocity];
});

System.create({
    kernel: "gpu",
    components: { with: [target, position] },
    // @ts-expect-error GPU kernels can't use lookups
    lookup: { targets: { with: [position] } },
}, () => {});

System.create({
    kernel: "gpu",
    // @ts-expect-error GPU kernels can't use change filters
    components: { with: [position], changed: [velocity] },
}, () => {});

System.create({
    kernel: "gpu",
    components: { with: [velocity, position] },
}, (row, context) => {
    // @ts-expect-error GPU kernels can't issue commands
    context.commands.despawn(row.entity);
});

System.create({
    // @ts-expect-error a kernel is true, false or "gpu"
    kernel: "cpu",
}, () => {});

// Without the flag a body compiles when it can; false runs it as written, whatever it uses.
System.create({ components: { with: [label] } }, () => {});
System.create({ kernel: false, components: { with: [label, path] } }, () => {});

System.create({
    // @ts-expect-error a system without components runs once, so there's nothing to compile
    kernel: true,
}, () => {});
System.create({
    // @ts-expect-error a system without components runs once, so there's nothing to compile, for the GPU either
    kernel: "gpu",
}, () => {});

// Reductions: each reduced resource is a function contributing a value of its type, folded with its trait's operator.
System.create({
    components: { with: [velocity, vector], changed: [velocity] },
}, (row, { reduce }) => {
    reduce[total](row[velocity]);
    reduce[bounds](row[vector]);
    reduce[flagged](row[velocity] > 1);
    // @ts-expect-error a contribution has the resource's type
    reduce[bounds](1);
    // @ts-expect-error a reduced resource can't be read
    void (reduce[total] + 1);
});

System.create({}, ({ reduce }) => {
    // @ts-expect-error only resources with a reduce trait can be reduced
    reduce[time](1);
});

System.create({
    kernel: "gpu",
    components: { with: [velocity] },
}, () => {});


// Render systems: the accessors name the components they read.
System.render({ components: { with: [player] }, shader: { accessors: { place: position, speed: velocity } } }, (gpu, { resources }) => {
    void [gpu.encoder, resources[time]];
});
System.render({ shader: { accessors: { place: position } } }, (_, context) => {
    // @ts-expect-error a render body issues no commands
    void context.commands;
});
System.render({
    // @ts-expect-error a render system reads the components its accessors name
    components: { read: [position] },
    shader: { accessors: { place: position } },
}, () => {});
System.render({ shader: { accessors: { place: position } } }, (_, { resources }) => {
    // @ts-expect-error a render system only reads
    resources[score] = 0;
});
// A pass helper several render systems share declares its context and tables by name.
const drawAll = (gpu: System.RenderContext, pass: GPURenderPassEncoder): void => {
    for (const table of gpu.tables) drawTable(table, pass);
};
const drawTable = (table: System.RenderTable, pass: GPURenderPassEncoder): void => {
    table.bind(pass);
    pass.draw(6, table.count);
};
System.render({ shader: { accessors: { place: position } } }, gpu => {
    const pass = gpu.encoder.beginRenderPass({ colorAttachments: [] });
    drawAll(gpu, pass);
    pass.end();
});
// `order` draws every matching archetype as one table, in a sorted index's order.
declare const byPosition: Index<{ readonly key: readonly [typeof position]; readonly sorted: true }>;
declare const hashedByPosition: Index<{ readonly key: readonly [typeof position] }>;
declare const someIndex: Index;
System.render({ components: { with: [player] }, order: byPosition, shader: { accessors: { place: position } } }, gpu => {
    const pass = gpu.encoder.beginRenderPass({ colorAttachments: [] });
    drawAll(gpu, pass);
    pass.end();
});
System.render({
    // @ts-expect-error a render system is ordered by a sorted index
    order: hashedByPosition,
    shader: { accessors: { place: position } },
}, () => {});
System.render({
    // @ts-expect-error an index whose declaration isn't known isn't known to be sorted
    order: someIndex,
    shader: { accessors: { place: position } },
}, () => {});
System.render({
    // @ts-expect-error an order is an index
    order: [position],
    shader: { accessors: { place: position } },
}, () => {});

// Names are optional: a declaration may leave it out, and a system that declares nothing is just its body.
export const unnamed = System.create({ components: { with: [position] } }, (row, { resources }) => {
    row[position] += resources[time];
});
check<Equal<typeof unnamed, System>>();
export const unnamedInput = System.create({}, (_context, input: { readonly count: number }) => {
    const count: number = input.count;
    void count;
});
check<Equal<typeof unnamedInput, System<{ readonly count: number }>>>();
export const bodyOnly = System.create(({ commands }) => {
    commands.spawn([position])({ [position]: 0 });
});
check<Equal<typeof bodyOnly, System>>();
// A body alone reads and writes resources as any system does.
System.create(({ resources }) => { resources[score] += 1; });
// @ts-expect-error a body alone runs once per run, so it has no row
System.create((row: { readonly entity: Entity }) => { void row; });
export const unnamedAll = System.create([unnamed, bodyOnly]);
check<Equal<typeof unnamedAll, System>>();
System.render({ shader: { accessors: { place: position } } }, gpu => { void gpu.encoder; });

// Observer systems read what a sync point left, after it: rows, resources, lookups and change filters, and no commands.
export const watchPositions = System.create({
    observer: true,
    components: { with: [position], changed: [position] },
    lookup: { targets: { with: [velocity] } },
}, (row, context) => {
    const read: number = row[position] + context.resources[time];
    void [read, context.lookup.targets(row.entity)];
    // @ts-expect-error an observer system reads only
    row[position] = 0;
    // @ts-expect-error an observer system issues no commands
    void context.commands;
});
check<Equal<typeof watchPositions, System>>();
export const watchTime = System.create({ observer: true, resources: { changed: [time] } }, ({ resources }) => { void resources[time]; });
// A composite may hold observer members, which run after its sync point.
export const withWatch = System.create([integrate, watchTime]);
check<Equal<typeof withWatch, System>>();
// @ts-expect-error observer is true or left out
System.create({ observer: false }, () => {});
System.create({ observer: true, components: { with: [position] } }, (row, { resources }) => {
    // @ts-expect-error an observer system writes no components
    row[position] = 0;
    // @ts-expect-error an observer system writes no resources
    resources[score] = 0;
});
System.create({ observer: true }, context => {
    // @ts-expect-error an observer system reduces into nothing
    void context.reduce;
});
// @ts-expect-error an observer system takes no input
System.create({ observer: true }, (_context, input: { readonly count: number }) => { void input; });
// @ts-expect-error an observer system isn't a kernel
System.create({ observer: true, kernel: true, components: { with: [position] } }, () => {});
System.create({ observer: true, kernel: false, components: { with: [position] } }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, after: [integrate] }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, before: [integrate] }, () => {});
// @ts-expect-error an observer system is ordered with nothing
System.create({ observer: true, during: [integrate] }, () => {});

// A system on one entity: its input names the entity, and its body runs on that entity's row.
type OnOne = { readonly entity: Entity; readonly by: number };
export const nudge = System.create({ target: "entity", components: { with: [position] } }, (row, _context, input: OnOne) => {
    row[position] += input.by;
});
check<Equal<typeof nudge, System<OnOne>>>();
// @ts-expect-error its target is an entity field of its input
System.create({ target: "by", components: { with: [position] } }, (_row, _context, input: OnOne) => { void input; });
// @ts-expect-error it takes its target from its input, so it takes input
System.create({ target: "entity", components: { with: [position] } }, row => { void row; });
// @ts-expect-error it runs on a row, so it needs components
System.create({ target: "entity" }, (_context, input: OnOne) => { void input; });
// @ts-expect-error not a kernel
System.create({ target: "entity", kernel: true, components: { with: [position] } }, (_row, _context, input: OnOne) => { void input; });
