import { Archetype } from "../interface/archetype/archetype.js";
import { Component } from "../interface/component/component.js";
import { Finalizer } from "../interface/finalizer/finalizer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark, Best } from "./benchmark.js";
import { fastest } from "./suite.js";

// Benchmarks of struct values, which a row reads into an object and writes back field by field: a 2D transform's five
// numbers, as an editor's nodes hold, beside a vec2 size.

const pose = Symbol("values/pose");
const shown = Symbol("values/shown");
const extent = Symbol("values/extent");
const order = Symbol("values/order");
type Pose = { readonly tx: number; readonly ty: number; readonly rotation: number; readonly sx: number; readonly sy: number };
declare module "@adobe/ecs" {
    export interface Components {
        [pose]: { type: Pose };
        [shown]: { type: Pose };
        [extent]: { type: readonly [number, number] };
        [order]: { type: number };
    }
}
const number = { type: "number" } as const;
const poseSchema = { type: "object", properties: { tx: number, ty: number, rotation: number, sx: number, sy: number }, required: ["tx", "ty", "rotation", "sx", "sy"] } as const;
Component.register(pose, { type: poseSchema });
Component.register(shown, { type: poseSchema });
Component.register(extent, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } });
Component.register(order, { type: number });

const Node = Archetype.create([pose, shown, extent, order]);

const rows = 100_000;

const seed = System.create({ name: "values/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn(Node)({ [pose]: { tx: i, ty: 0, rotation: 0, sx: 1, sy: 1 }, [shown]: { tx: 0, ty: 0, rotation: 0, sx: 1, sy: 1 }, [extent]: [1, 1], [order]: i });
});

/** Shows each row's pose: a struct read and written whole per row. */
const showPose = System.create({ name: "values/showPose", components: { read: [pose], write: [shown] } }, row => { row[shown] = row[pose]; });

/** Commits a pose and an extent per row as commands, values every row already has. */
const commitPose = System.create({ name: "values/commitPose", kernel: "cpu", components: { read: [order] } }, (row, { commands }) => {
    commands.add(row.entity, pose, { tx: row[order], ty: 1, rotation: 0, sx: 1, sy: 1 });
    commands.add(row.entity, extent, [2, 2]);
});

const seeded = async (pool: number): Promise<World> => {
    const world = createWorld({ [workers]: pool });
    await world.run(seed, { count: rows });
    return world;
};

/** Entities the watching finalizer saw replace a pose, its last sync point. */
let replacedPoses = 0;

export const valueBenchmarks: readonly Benchmark[] = [
    {
        name: "struct copy 100K",
        operation: "A main-thread row system reading a five-number struct and writing it to another component: a transform shown, copied or edited per row.",
        per: "rows",
        n: rows,
        typical: [1_000, 100_000],
        best: { bytes: 80, basis: "Each row reads 40 bytes and writes 40." },
        run: async () => {
            const world = await seeded(0);
            const best = await fastest(() => world.run(showPose));
            await world.dispose();
            return best;
        },
    },
    {
        name: "struct replace kernel watched",
        operation: "As `struct replace kernel main`, with a changes finalizer watching both components: an edit history recording each commit's replaced values.",
        per: "commands",
        n: 2 * rows,
        typical: [1_000, 100_000],
        best: { bytes: 32, basis: "Each command writes its 40-byte struct or 8-byte vec2 and reads its entity's 8-byte location." },
        run: async () => {
            // Program-wide, so made here, in this benchmark's own process.
            Finalizer.changes({ name: "values/history", watch: [pose, extent] }, ({ groups }) => {
                replacedPoses = 0;
                for (const group of groups) if (group.replaced.includes(pose)) replacedPoses += group.entities.length;
            });
            const world = await seeded(0);
            const best = await fastest(() => world.run(commitPose));
            await world.dispose();
            if (replacedPoses !== rows) throw new Error("struct replace kernel watched: wrong count");
            return best;
        },
    },
];

/** `struct replace kernel` on the world's thread alone, or on a pool of `pool` workers. */
export const structReplace = (label: string, pool: number, on?: Best["on"]): Benchmark => ({
    name: `struct replace kernel ${label}`,
    operation: "A kernel adding a five-number struct and a vec2 every row already has: a gesture committing its rows' values as commands, so change sets see them.",
    per: "commands",
    n: 2 * rows,
    typical: [1_000, 100_000],
    best: { bytes: 32, basis: "Each command writes its 40-byte struct or 8-byte vec2 and reads its entity's 8-byte location.", ...on === undefined ? {} : { on } },
    run: async () => {
        const world = await seeded(pool);
        const best = await fastest(() => world.run(commitPose));
        await world.dispose();
        return best;
    },
});
