// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "../interface/entity/entity.js";
import type { Vec3 } from "../interface/math/index.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { Tables } from "../interface/system/tables.js";
import type { Table } from "../interface/world/table/table.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// Spawning 1M entities into a fresh world in one sync point, each owned by an earlier one or by none: from tables, as
// loading a snapshot does, and from commands; and the same tables without the owner reference.

const position = Symbol("tables/position");
const owner = Symbol("tables/owner");
declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [owner]: { type: Entity; reference: "owner" };
    }
}

const count = 1_000_000;

/** A root and `count - 1` entities, each owned by the one at half its position. */
const build = System.create(({ commands }) => {
    const made: Entity[] = [commands.spawn([position])({ [position]: [0, 0, 0] })];
    const owned = commands.spawn([position, owner]);
    for (let i = 1; i < count; i++) made.push(owned({ [position]: [i, i, i], [owner]: made[i >> 1] }));
});

const tablesOf = (components: readonly (typeof position | typeof owner)[]) =>
    System.create({ readonly: true, tables: { components } }, ({ tables }): Tables => tables);

const given: { tables: readonly Table[] } = { tables: [] };
const spawnGiven = System.create(({ commands }) => {
    commands.spawnTables(given.tables);
});

/** The fastest of a few runs spawning `tables` into a fresh world. */
const spawnFastest = async (tables: readonly Table[]): Promise<number> => {
    let best = Infinity;
    for (let k = 0; k < 7; k++) {
        const world = createWorld({ [workers]: 0 });
        given.tables = tables;
        const start = performance.now();
        await world.run(spawnGiven);
        const time = performance.now() - start;
        // The first runs warm up.
        if (k >= 2) best = Math.min(best, time);
        await world.dispose();
    }
    given.tables = [];
    return best;
};

const tables = async (components: readonly (typeof position | typeof owner)[]): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(build);
    const { archetypes } = await world.run(tablesOf(components));
    await world.dispose();
    return spawnFastest(archetypes);
};

/** The fastest of a few runs of `build` in a fresh world. */
const commanded = async (): Promise<number> => {
    let best = Infinity;
    for (let k = 0; k < 7; k++) {
        const world = createWorld({ [workers]: 0 });
        const start = performance.now();
        await world.run(build);
        const time = performance.now() - start;
        if (k >= 2) best = Math.min(best, time);
        await world.dispose();
    }
    return best;
};

export const tableBenchmarks: readonly Benchmark[] = [
    {
        name: "spawn tables 1M owner",
        operation: "commands.spawnTables of 1M entities into a fresh world, each but one owned by another of them, and its sync point: loading a snapshot of a hierarchy.",
        per: "spawns",
        n: count,
        typical: [1_000, 1_000_000],
        best: { bytes: 36, basis: "Each entity copies its 12-byte position and 8-byte owner, and writes its 8-byte entity and location." },
        run: () => tables([position, owner]),
    },
    {
        name: "spawn tables 1M",
        operation: "As `spawn tables 1M owner`, without the owner reference: its cost is the difference.",
        per: "spawns",
        n: count,
        typical: [1_000, 1_000_000],
        best: { bytes: 28, basis: "Each entity copies its 12-byte position, and writes its 8-byte entity and location." },
        run: () => tables([position]),
    },
    {
        name: "spawn owned 1M",
        operation: "A main-thread system spawning 1M entities through one spawner, each but one owned by an earlier one, and its sync point.",
        per: "spawns",
        n: count,
        typical: [1_000, 1_000_000],
        best: { bytes: 36, basis: "Each entity writes its 12-byte position and 8-byte owner, its 8-byte entity and location." },
        run: commanded,
    },
];
