import type { Entity } from '../entity/entity.js';
import { System } from './system.js';

const position = 'systemTest/position';
const velocity = 'systemTest/velocity';
const target = 'systemTest/target';
const player = Symbol('systemTest/player');
const time = 'systemTest/time';
const score = 'systemTest/score';

declare module '../component/types.js' {
    export interface Types {
        [position]: number;
        [velocity]: number;
        [target]: Entity;
        [player]: true;
    }
}
declare module '../resource/types.js' {
    export interface Types {
        [time]: number;
        [score]: number;
    }
}
declare module './types.js' {
    export interface Types {
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
    query: { read: [velocity], write: [position], has: [player] },
    resources: { read: [time] },
}, (row, { [time]: delta }) => {
    row[position] += row[velocity] * delta;
    const entity: Entity = row.entity;
    // @ts-expect-error read values are read-only
    row[velocity] = 0;
    // @ts-expect-error entity is read-only
    row.entity = entity;
    // @ts-expect-error components outside read and write are not in the row
    void row[player];
});

// Lookups: read-only values by entity, or null.
export const follow = System.create({
    name: "test/follow",
    query: { read: [target, position], write: [velocity] },
    lookup: { targets: { read: [position] } },
    after: ["test/integrate"],
}, (row, { targets }) => {
    const other = targets(row[target]);
    if (other !== null) {
        row[velocity] = other[position] - row[position];
        // @ts-expect-error lookup values are read-only
        other[position] = 0;
    }
    // @ts-expect-error a lookup returns null for a missing entity
    void targets(row[target])[position];
});

// Arguments: typed from the schema.
export const move = System.create({
    name: "test/move",
    args: { type: "object", properties: { distance: { type: "number" } } },
    query: { has: [player], write: [position] },
}, (row, { args }) => {
    row[position] += args.distance;
});

// Resource-only system: no row; resource writes are writable.
export const tally = System.create({
    name: "test/tally",
    resources: { read: [time], write: [score] },
}, (row, context, commands) => {
    const none: undefined = row;
    context[score] += context[time];
    // @ts-expect-error read resources are read-only
    context[time] = 0;
    const spawned: Entity = commands.spawn({ [position]: 0, [player]: true });
    // @ts-expect-error spawn values must match the component type
    commands.spawn({ [position]: "zero" });
    commands.remove(spawned, velocity);
    void none;
});

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
    args: { type: "number" },
    // @ts-expect-error a system with arguments can't use change filters
    query: { changed: [position] },
}, () => {});

System.create({
    name: "test/tally",
    resources: { read: [time] },
    // @ts-expect-error a lookup can't share a name with a resource
    lookup: { [time]: { read: [position] } },
}, () => {});

System.create({
    name: "test/tally",
    // @ts-expect-error a lookup can't be named args
    lookup: { args: { read: [position] } },
}, () => {});

export const main = System.composite({ name: "test/main", systems: [integrate, follow, tally] });

// @ts-expect-error a system with arguments can't be a composite member
System.composite({ name: "test/main", systems: [move] });

const noArguments: System.Arguments<typeof integrate> = [];
const moveArguments: System.Arguments<typeof move> = [{ distance: 1 }];
const compositeArguments: System.Arguments<typeof main> = [];
void [noArguments, moveArguments, compositeArguments];

const label = 'systemTest/label';
const path = 'systemTest/path';
const vector = 'systemTest/vector';
declare module '../component/types.js' {
    export interface Types {
        [label]: string;
        [path]: readonly number[];
        [vector]: readonly [number, number, number];
    }
}

// Kernels: linear values (numbers, booleans, entities, fixed tuples), read-only resources.
System.create({
    name: "test/integrate",
    kernel: "cpu",
    query: { read: [velocity, vector, player, target], write: [position], has: [label] },
    resources: { read: [time] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel values must be linear
    query: { read: [label] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "cpu",
    // @ts-expect-error kernel values can't be variable-length arrays
    query: { write: [path] },
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
    query: { read: [velocity], write: [position] },
    resources: { read: [time] },
}, row => {
    row[position] = row[velocity];
});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    // @ts-expect-error GPU kernel values must be linear too
    query: { read: [label] },
}, () => {});

System.create({
    name: "test/follow",
    kernel: "gpu",
    query: { read: [target], write: [position] },
    // @ts-expect-error GPU kernels can't use lookups
    lookup: { targets: { read: [position] } },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    // @ts-expect-error GPU kernels can't use change filters
    query: { write: [position], changed: [velocity] },
}, () => {});

System.create({
    name: "test/integrate",
    kernel: "gpu",
    query: { read: [velocity], write: [position] },
}, (row, _, commands) => {
    // @ts-expect-error GPU kernels can't issue commands
    commands.despawn(row.entity);
});

System.create({
    name: "test/integrate",
    // @ts-expect-error a kernel is "cpu" or "gpu"
    kernel: true,
    query: { read: [velocity] },
}, () => {});
