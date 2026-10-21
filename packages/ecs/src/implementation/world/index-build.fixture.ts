import { Component } from "../../interface/component/component.js";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { runReported } from "./reports.test-helper.js";

/** Scenarios of indexes built again across the pool, run built in node and from source in chromium. */

const cell = Symbol("indexBuildTest/cell");
const serial = Symbol("indexBuildTest/serial");
const weight = Symbol("indexBuildTest/weight");

declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: readonly [number, number] };
        [serial]: { type: number };
        [weight]: { type: number };
    }
}
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(serial, { type: { type: "integer", minimum: 0, maximum: 10000000 } });
Component.register(weight, { type: { type: "number" } });

const grid = Index.create({ name: "indexBuildTest/grid", key: [cell], components: { has: [weight] } });
const serials = Index.create({ name: "indexBuildTest/serials", key: [serial], unique: true });

const width = 300;
const height = 200;
const count = 150_000;

/** Spawns entities in cells, with serials of which a few repeat. */
const seed = System.create({ name: "indexBuildTest/seed" }, ({ commands }) => {
    for (let k = 0; k < count; k++) {
        commands.spawn([cell, serial, weight])({ [cell]: [(k * 7919) % width, (k * 104729) % height], [serial]: k % 50_000 === 7 ? 7 : k, [weight]: k % 13 });
    }
});

/** Moves every entity to another cell, so the next refresh builds the index again. */
const shuffle = System.create({ name: "indexBuildTest/shuffle", components: { write: [cell] } }, row => {
    const [x, y] = row[cell];
    row[cell] = [(x * 7 + 3) % width, (y + x) % height];
});

/** A kernel, so the pool starts, as it does with a world's first kernel. */
const warm = System.create({ name: "indexBuildTest/warm", kernel: "cpu", components: { read: [serial], write: [weight] } }, row => {
    row[weight] = row[serial] % 13;
});

const seen = { grid: 0, rows: 0, serials: 0 };

/** Every cell's rows, in order, folded into one number; and the unique index's row of each serial. */
const read = System.create({
    name: "indexBuildTest/read",
    lookup: { near: { index: grid, read: [weight] }, bySerial: { index: serials } },
}, ({ lookup }) => {
    let fold = 0;
    let rows = 0;
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            const near = lookup.near([x, y]);
            for (let i = 0; i < near.length; i++) {
                const row = near.at(i);
                fold = (Math.imul(fold ^ row.entity, 0x9E3779B1) + row[weight] + i) | 0;
                rows++;
            }
        }
    }
    let serialFold = 0;
    for (let s = 0; s < count; s += 37) serialFold = (Math.imul(serialFold, 31) + (lookup.bySerial(s)?.entity ?? -1)) | 0;
    seen.grid = fold;
    seen.rows = rows;
    seen.serials = serialFold;
});

/** The same folds without an index: each cell's rows sorted by entity, and each serial's lowest entity. */
const reference = System.create({ name: "indexBuildTest/reference", components: { read: [cell, serial, weight] } }, row => {
    const [x, y] = row[cell];
    const cellRows = byCell[x * height + y] ??= [];
    cellRows.push([row.entity, row[weight]]);
    const held = lowest.get(row[serial]);
    if (held === undefined || row.entity < held) lowest.set(row[serial], row.entity);
});
let byCell: (readonly [number, number])[][] = [];
const lowest = new Map<number, number>();
const referenceFolds = (): readonly number[] => {
    let fold = 0;
    let rows = 0;
    for (let k = 0; k < width * height; k++) {
        const sorted = (byCell[k] ?? []).sort((a, b) => a[0] - b[0]);
        sorted.forEach(([entity, value], i) => {
            fold = (Math.imul(fold ^ entity, 0x9E3779B1) + value + i) | 0;
            rows++;
        });
    }
    let serialFold = 0;
    for (let s = 0; s < count; s += 37) serialFold = (Math.imul(serialFold, 31) + (lowest.get(s) ?? -1)) | 0;
    return [fold, rows, serialFold];
};

/** What two builds gave, the second after every key changed, and the same without an index, the unique index's failures, and how many builds ran across the pool. */
export const simulate = async (threads: number): Promise<{ readonly folds: readonly number[]; readonly expected: readonly number[]; readonly failures: readonly string[]; readonly pooled: number }> => {
    const world = createWorld({ [workers]: threads });
    try {
        await world.run(seed);
        await world.run(warm);
        const folds: number[] = [];
        const expected: number[] = [];
        const failures: string[] = [];
        for (let round = 0; round < 2; round++) {
            const report = await runReported(world, read);
            failures.push(...report.failures.map(failure => `${failure.kind} ${failure.name} ${failure.message}`));
            folds.push(seen.grid, seen.rows, seen.serials);
            byCell = [];
            lowest.clear();
            await world.run(reference);
            expected.push(...referenceFolds());
            await world.run(shuffle);
        }
        return { folds, expected, failures, pooled: (await world.tables()).pooledBuilds };
    }
    finally {
        await world.dispose();
    }
};
