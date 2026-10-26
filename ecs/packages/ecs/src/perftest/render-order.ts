// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../interface/entity/entity.js";
import { Index } from "../interface/indexes/index-type.js";
import { gpuDevice } from "../interface/resources/gpu-device.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/world/create.js";
import type { Benchmark } from "./benchmark.js";
import type { F32 } from "../interface/math/index.js";

// A 2D editor's paint order: shapes and images, two archetypes, interleaved in depth, drawn as one table in a sorted
// index's order.

const paintDepth = Symbol("renderOrder/paintDepth");
const shape = Symbol("renderOrder/shape");
const image = Symbol("renderOrder/image");
declare module "@adobe/ecs" {
    export interface Components {
        [paintDepth]: { type: F32 };
        [shape]: { type: true };
        [image]: { type: true };
    }
}

const byDepth = Index.create({ key: [paintDepth], sorted: true });

const items = 50_000;
let spawned: Entity[] = [];
const spawn = System.create({}, ({ commands }) => {
    spawned = [];
    for (let i = 0; i < items; i++) {
        spawned.push(i % 2 === 0 ? commands.spawn([paintDepth, shape])({ [paintDepth]: i, [shape]: true }) : commands.spawn([paintDepth, image])({ [paintDepth]: i, [image]: true }));
    }
});
/** Moves one item to a new depth, as reordering it does. */
const restack = System.create({
    components: { with: [paintDepth] },
    target: "item",
}, (row, _context, input: { readonly item: Entity; readonly depth: number }) => {
    row[paintDepth] = input.depth;
});
/** Draws nothing: its run uploads what it reads and its order. */
const draw = System.render({ order: byDepth, shader: { accessors: { paintDepth } }, after: [restack] }, () => {});
const frame = System.create({ systems: [restack, draw] });

/** Timed per run by `timed`, which waits for the GPU. */
export const renderOrderBenchmarks = (device: GPUDevice, timed: (run: () => Promise<unknown>) => Promise<number>): readonly Benchmark[] => [{
    name: "gpu ordered render unchanged 50K",
    operation: "A render system with an order over 50K shapes and images, two archetypes interleaved in depth, run with nothing changed: it uploads nothing and writes neither its order nor its record.",
    per: "runs",
    n: 1,
    typical: [1, 1],
    best: { bytes: 64, basis: "A run reads at least one cache line of its system's state." },
    run: async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: device });
        try {
            await world.run(spawn);
            await world.run(draw);
            return await timed(() => world.run(draw));
        }
        finally {
            await world.dispose();
        }
    },
}, {
    name: "gpu ordered render one key 50K",
    operation: "A target system moving one of 50K shapes and images to another depth, then a render system ordered by depth, which refreshes the index, lists the 50K in order and writes them, 200 KB.",
    per: "runs",
    n: 1,
    typical: [1, 1],
    best: { bytes: 400_000, basis: "The order's 50K 4-byte entries are written on the CPU and again by the upload.", on: "gpu" },
    run: async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: device });
        try {
            await world.run(spawn);
            const item = spawned[items / 2];
            let depth = 0.5;
            await world.run(frame, { item, depth });
            // Between two others each time, so its place in the order moves.
            return await timed(() => world.run(frame, { item, depth: depth = (depth + 1009) % items }));
        }
        finally {
            await world.dispose();
        }
    },
}];
