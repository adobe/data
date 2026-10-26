// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../interface/entity/entity.js";
import type { Vec2 } from "../interface/math/index.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Shared components: a row reading its archetype's value against one reading a column, in a body and a kernel;
// spawning with a shared constant against spawning without one; `where` culling cells to a camera's view, still and
// moving; and many small archetypes, one per value, against one archetype holding the same rows with a column.

const height = Symbol("shared/height");
const lift = Symbol("shared/lift");
const level = Symbol("shared/level");
const cell = Symbol("shared/cell");
const value = Symbol("shared/value");
const group = Symbol("shared/group");
const camera = Symbol("shared/camera");
declare module "@adobe/ecs" {
    export interface Components {
        [height]: { type: number };
        [lift]: { type: number };
        // `lift`'s value, shared.
        [level]: { type: number; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [value]: { type: number };
        // An archetype's number, as a column: the baseline for archetypes told apart by `cell`.
        [group]: { type: number };
    }
    export interface Resources {
        [camera]: { type: { readonly x: number; readonly y: number; readonly radius: number }; default: { x: 0; y: 0; radius: 1 } };
    }
}

const rows = 100_000;

// Reads: 100K rows in one archetype, lifted by a column or by the archetype's shared value.
const seedReads = System.create({}, ({ commands }) => {
    const shared = commands.spawn([height, level], { [level]: 1 });
    for (let i = 0; i < rows; i++) {
        commands.spawn([height, lift])({ [height]: 0, [lift]: 1 });
        shared({ [height]: 0 });
    }
});
const raiseShared = System.create({ kernel: false, components: { with: [height, level] } }, row => {
    row[height] += row[level];
});
const raiseSharedKernel = System.create({ kernel: true, components: { with: [height, level] } }, row => {
    row[height] += row[level];
});
const raiseColumn = System.create({ kernel: false, components: { with: [height, lift] } }, row => {
    row[height] += row[lift];
});
const raiseColumnKernel = System.create({ kernel: true, components: { with: [height, lift] } }, row => {
    row[height] += row[lift];
});

const reads = async (system: System<void>): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedReads);
    const best = await fastest(() => world.run(system));
    await world.dispose();
    return best;
};

// Spawns: one entity into each of four cells, by a spawner with a shared constant each, against four archetypes of
// columns; and 100K into one cell.
const spawnPreset = System.create(({ commands }) => {
    for (let k = 0; k < 4; k++) commands.spawn([cell, value], { [cell]: [k, 0] })({ [value]: k });
});
const spawnPlain = System.create(({ commands }) => {
    commands.spawn([value])({ [value]: 0 });
    commands.spawn([value, height])({ [value]: 1, [height]: 0 });
    commands.spawn([value, lift])({ [value]: 2, [lift]: 0 });
    commands.spawn([value, group])({ [value]: 3, [group]: 0 });
});
const spawnBulkPreset = System.create(({ commands }) => {
    const spawn = commands.spawn([cell, value], { [cell]: [0, 0] });
    for (let i = 0; i < rows; i++) spawn({ [value]: i });
});
const spawnBulkPlain = System.create(({ commands }) => {
    for (let i = 0; i < rows; i++) commands.spawn([value, group])({ [value]: i, [group]: 0 });
});
const despawnValues = System.create({ components: { with: [value] } }, (row, { commands }) => { commands.despawn(row.entity); });

const spawns = async (system: System<void>, bulk: boolean): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    let best = Infinity;
    if (!bulk) best = await fastest(() => world.run(system));
    else {
        for (let k = 0; k < 12; k++) {
            const start = performance.now();
            await world.run(system);
            best = Math.min(best, performance.now() - start);
            await world.run(despawnValues);
        }
    }
    await world.dispose();
    return best;
};

// Culling: 1K cells of 32 × 32, ten rows each, a system over the cells within a camera's view, 3 × 3 of them.
const side = 32;
const perCell = 10;
const seedCells = System.create(({ commands }) => {
    for (let x = 0; x < side; x++) {
        for (let y = 0; y < side; y++) {
            const spawn = commands.spawn([cell, value], { [cell]: [x, y] });
            for (let k = 0; k < perCell; k++) spawn({ [value]: k });
        }
    }
});
const pan = System.create(({ resources }) => {
    const { x } = resources[camera];
    resources[camera] = { x: x >= side - 2 ? 1 : x + 1, y: 16, radius: 1 };
});
const visit = System.create({
    kernel: false,
    after: [pan],
    components: { with: [value], where: { [cell]: (at, { resources }) => Math.max(Math.abs(at[0] - resources[camera].x), Math.abs(at[1] - resources[camera].y)) <= resources[camera].radius } },
}, row => {
    row[value] += 1;
});
const still = System.create([visit]);
const moving = System.create({ systems: [pan, visit] });

const culling = async (system: System<void>): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedCells);
    const best = await fastest(() => world.run(system));
    await world.dispose();
    return best;
};

// Culling with a change filter: the same cells, 1% of rows moving to the next cell along x with a new value before each
// run, so a system with `where` and `changed` sees what moved into its view; against the same filter without `where`.
const movers = Math.round(side * side * perCell / 100);
const placed: { entity: Entity; x: number; y: number; value: number }[] = [];
let moved = 0;
const seedMovers = System.create(({ commands }) => {
    placed.length = moved = 0;
    for (let x = 0; x < side; x++) {
        for (let y = 0; y < side; y++) {
            const spawn = commands.spawn([cell, value], { [cell]: [x, y] });
            for (let k = 0; k < perCell; k++) placed.push({ entity: spawn({ [value]: k }), x, y, value: k });
        }
    }
});
const drift = System.create(({ commands }) => {
    for (let k = 0; k < movers; k++) {
        const at = placed[(moved++ * 101) % placed.length];
        at.x = (at.x + 1) % side;
        at.value++;
        commands.add(at.entity, cell, [at.x, at.y]);
        commands.add(at.entity, value, at.value);
    }
});
let seenChanged = 0;
const seeChanged = System.create({
    kernel: false,
    components: { with: [value], changed: [value], where: { [cell]: (at, { resources }) => Math.max(Math.abs(at[0] - resources[camera].x), Math.abs(at[1] - resources[camera].y)) <= resources[camera].radius } },
}, () => { seenChanged++; });
const seeChangedEverywhere = System.create({ kernel: false, components: { with: [value], changed: [value] } }, () => { seenChanged++; });

/** The fastest of a system's runs, each after a run of `drift` and its sync point, the camera `radius` cells wide. */
const drifting = async (system: System<void>, radius: number): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedMovers);
    await world.run(System.create(({ resources }) => { resources[camera] = { x: 16, y: 16, radius }; }));
    let best = Infinity;
    for (let k = 0; k < 400; k++) {
        await world.run(drift);
        const start = performance.now();
        await world.run(system);
        best = Math.min(best, performance.now() - start);
    }
    await world.dispose();
    return best;
};

// Walking: one entity moving to a new cell each run, 100K cells, each cell's archetype emptied as it leaves, then a
// system over one row; against the same system before the walk. And an entity crossing between two cells each run.
let walker = Entity.none;
const seedWalker = System.create(({ commands }) => {
    walker = commands.spawn([cell, value], { [cell]: [0, 0] })({ [value]: 0 });
});
const walkTo = System.create({}, ({ commands }, input: { readonly x: number }) => { commands.add(walker, cell, [input.x, 0]); });
const touchOne = System.create({ kernel: false, components: { with: [value] } }, row => { row[value] += 1; });

const walking = async (cells: number): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedWalker);
    for (let x = 1; x <= cells; x++) await world.run(walkTo, { x });
    const best = await fastest(() => world.run(touchOne));
    await world.dispose();
    return best;
};

/** The fastest run moving the walker to a cell it never visited, and its sync point. */
const walkingOn = async (): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedWalker);
    let x = 1;
    const best = await fastest(() => world.run(walkTo, { x: x++ }));
    await world.dispose();
    return best;
};

/** The fastest run moving the walker round `cells` cells, each left empty for `cells - 1` sync points. */
const flickering = async (cells: number): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedWalker);
    let x = 0;
    const best = await fastest(() => world.run(walkTo, { x: x++ % cells }));
    await world.dispose();
    return best;
};

// Small archetypes: 10K rows in 1K archetypes of one cell each, against the same rows in one archetype with a column.
const seedSmall = System.create({}, ({ commands }, input: { readonly shared: boolean }) => {
    for (let x = 0; x < side; x++) {
        for (let y = 0; y < side; y++) {
            const spawn = commands.spawn([cell, value], { [cell]: [x, y] });
            for (let k = 0; k < perCell; k++) {
                if (input.shared) spawn({ [value]: k });
                else commands.spawn([group, value])({ [group]: x * side + y, [value]: k });
            }
        }
    }
});
const touchAll = System.create({ kernel: false, components: { with: [value] } }, row => {
    row[value] += 1;
});

const small = async (shared: boolean): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seedSmall, { shared });
    const best = await fastest(() => world.run(touchAll));
    await world.dispose();
    return best;
};

const readsPer = { per: "rows", n: rows, typical: [1_000, 100_000], best: { bytes: 16, basis: "Each row reads its 8-byte lift, its archetype's for a shared one, and reads and writes its 8-byte height." } } as const;

export const sharedBenchmarks: readonly Benchmark[] = [
    {
        name: "shared read 100K",
        operation: "A main-thread row system adding its archetype's value of a shared component to a column, over 100K rows: the baseline is `column read 100K`.",
        ...readsPer,
        run: () => reads(raiseShared),
    },
    {
        name: "column read 100K",
        operation: "As `shared read 100K`, reading a column of each row's own value instead.",
        ...readsPer,
        run: () => reads(raiseColumn),
    },
    {
        name: "shared read 100K kernel",
        operation: "As `shared read 100K`, compiled to a kernel, which takes the value as a parameter of each call.",
        ...readsPer,
        run: () => reads(raiseSharedKernel),
    },
    {
        name: "column read 100K kernel",
        operation: "As `column read 100K`, compiled to a kernel.",
        ...readsPer,
        run: () => reads(raiseColumnKernel),
    },
    {
        name: "spawn singles shared",
        operation: "A run spawning one entity into each of four cells, by a spawner with a shared constant each: the fixed cost of a few spawns into chunks; `spawn singles plain` spawns into four archetypes of columns.",
        per: "spawns",
        n: 4,
        typical: [1, 10],
        best: { bytes: 64 / 4 + 24, basis: "Each entity writes its values, entity and location, and the run reads a cache line of its system's state." },
        run: () => spawns(spawnPreset, false),
    },
    {
        name: "spawn singles plain",
        operation: "As `spawn singles shared`, into four archetypes of columns, by spawners without constants.",
        per: "spawns",
        n: 4,
        typical: [1, 10],
        best: { bytes: 64 / 4 + 24, basis: "Each entity writes its values, entity and location, and the run reads a cache line of its system's state." },
        run: () => spawns(spawnPlain, false),
    },
    {
        name: "spawn bulk shared",
        operation: "A system spawning 100K entities into one cell, by one spawner with a shared constant, and their sync point: populating a chunk.",
        per: "spawns",
        n: rows,
        typical: [100, 100_000],
        best: { bytes: 24, basis: "Each entity writes its 8-byte value, its 8-byte entity and its 8-byte location." },
        run: () => spawns(spawnBulkPreset, true),
    },
    {
        name: "spawn bulk plain",
        operation: "As `spawn bulk shared`, the cell a column of each entity's own.",
        per: "spawns",
        n: rows,
        typical: [100, 100_000],
        best: { bytes: 32, basis: "Each entity writes its two 8-byte values, its 8-byte entity and its 8-byte location." },
        run: () => spawns(spawnBulkPlain, true),
    },
    {
        name: "where 1K cells still",
        operation: "A system with `where` over 1K cells of ten rows, visiting the 3 × 3 cells in a camera's view, the camera still: what culling costs a run once evaluated.",
        per: "cells",
        n: side * side,
        typical: [100, 10_000],
        best: { bytes: 64 / (side * side) + 9 * perCell * 16 / (side * side), basis: "The run reads a cache line of its state, and each visited row reads and writes its 8-byte value." },
        run: () => culling(still),
    },
    {
        name: "where 1K cells moving",
        operation: "As `where 1K cells still`, the camera moving a cell each run: every cell's predicate is evaluated again.",
        per: "cells",
        n: side * side,
        typical: [100, 10_000],
        best: { bytes: 8 + 9 * perCell * 16 / (side * side), basis: "Each cell's value is read once, and each visited row reads and writes its 8-byte value." },
        run: () => culling(moving),
    },
    {
        name: "where changed 1K cells drifting",
        operation: "A system with `where` and `changed` over the 3 × 3 cells of 1K in a camera's view, each run after 1% of their 10K rows moved to the next cell with a new value: a culled system following what moves into its view.",
        per: "cells",
        n: side * side,
        typical: [100, 10_000],
        best: { bytes: 64 / (side * side), basis: "The run reads a cache line of its state; the rows moving into view are a few of the run's." },
        run: () => drifting(seeChanged, 1),
    },
    {
        name: "where changed 1K cells drifting in view",
        operation: "As `where changed 1K cells drifting`, every cell in the camera's view: each run's moves arrive in cells it goes over.",
        per: "cells",
        n: side * side,
        typical: [100, 10_000],
        best: { bytes: movers * 8 / (side * side), basis: "Each changed row's 8-byte value is read." },
        run: () => drifting(seeChanged, side),
    },
    {
        name: "changed 1K cells drifting",
        operation: "As `where changed 1K cells drifting`, the system without `where`, over every cell's changed rows.",
        per: "cells",
        n: side * side,
        typical: [100, 10_000],
        best: { bytes: movers * 8 / (side * side), basis: "Each changed row's 8-byte value is read." },
        run: () => drifting(seeChangedEverywhere, 1),
    },
    {
        name: "one row after 100K cells walked",
        operation: "A main-thread row system over one row, after the entity walked through 100K cells, one a run, each cell's archetype emptied behind it: what a world that has seen many values costs a run; `one row before a walk` is the same before it.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => walking(100_000),
    },
    {
        name: "one row before a walk",
        operation: "As `one row after 100K cells walked`, before the walk.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => walking(0),
    },
    {
        name: "walk to a new cell",
        operation: "A run moving one entity to a cell it never visited, and its sync point: an archetype for the new value, reused from those reclaimed behind it, and the one it left emptied.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => walkingOn(),
    },
    {
        name: "flicker between 2 cells",
        operation: "A run moving one entity to the other of two cells, and its sync point: an archetype emptied and filled again each sync point, which reclaiming waits out.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => flickering(2),
    },
    {
        name: "circle 8 cells",
        operation: "As `flicker between 2 cells`, round 8 cells, each emptied for 7 sync points, past what reclaiming waits: each run's cell's archetype reclaimed and reused.",
        per: "runs",
        n: 1,
        typical: [1, 1],
        best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
        run: () => flickering(8),
    },
    {
        name: "small archetypes 1K",
        operation: "A main-thread row system over 10K rows in 1K archetypes of one shared value each: the cost of many small archetypes; `one archetype 10K` holds the same rows with a column.",
        per: "rows",
        n: side * side * perCell,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads and writes its 8-byte value." },
        run: () => small(true),
    },
    {
        name: "one archetype 10K",
        operation: "As `small archetypes 1K`, the rows in one archetype, each with its group's number in a column.",
        per: "rows",
        n: side * side * perCell,
        typical: [1_000, 100_000],
        best: { bytes: 16, basis: "Each row reads and writes its 8-byte value." },
        run: () => small(false),
    },
];
