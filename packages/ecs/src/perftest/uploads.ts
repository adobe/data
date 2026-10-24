// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../interface/entity/entity.js";
import { gpuDevice } from "../interface/resources/gpu-device.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/world/create.js";
import type { Benchmark } from "./benchmark.js";
import type { Vec3 } from "../interface/math/index.js";

// A drag: the CPU writes one row of a column a render system holds on the GPU, which uploads what changed.

const place = Symbol("uploads/place");
declare module "@adobe/ecs" {
    export interface Components {
        [place]: { type: Vec3 };
    }
}

const shapes = 100_000;
let spawned: Entity[] = [];
const spawn = System.create({}, ({ commands }) => {
    spawned = [];
    for (let i = 0; i < shapes; i++) spawned.push(commands.spawn([place])({ [place]: [i, 0, 0] }));
});
const drag = System.create({
    components: { write: [place] },
    target: "shape",
}, (row, _context, input: { readonly shape: Entity; readonly x: number }) => {
    row[place] = [input.x, 1, 0];
});
/** Draws nothing: its run uploads what it reads. */
const draw = System.render({ shader: { accessors: { place } }, after: [drag] }, () => {});
const frame = System.create({ systems: [drag, draw] });
const slide = System.create({ kernel: "cpu", components: { write: [place] } }, row => {
    const [x, y, z] = row[place];
    row[place] = [x + 1, y, z];
});
const drawAfterSlide = System.render({ shader: { accessors: { place } }, after: [slide] }, () => {});
const slideFrame = System.create({ systems: [slide, drawAfterSlide] });

/** Timed per run by `timed`, which waits for the GPU. */
export const uploadBenchmarks = (device: GPUDevice, timed: (run: () => Promise<unknown>) => Promise<number>): readonly Benchmark[] => [{
    name: "gpu upload one row 100K",
    operation: "A target system writing one row of 100K 12-byte positions a render system draws, as a drag does, then the render system's run, which uploads what the CPU changed.",
    per: "runs",
    n: 1,
    typical: [1, 1],
    best: { bytes: 12, basis: "The upload writes the one 12-byte position changed.", on: "gpu" },
    run: async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: device });
        try {
            await world.run(spawn);
            const shape = spawned[shapes / 2];
            let x = 0;
            await world.run(frame, { shape, x });
            return await timed(() => world.run(frame, { shape, x: ++x }));
        }
        finally {
            await world.dispose();
        }
    },
}, {
    name: "gpu upload all rows 100K",
    operation: "A CPU kernel on the main thread writing every row of 100K 12-byte positions a render system draws, then the render system's run, which uploads them.",
    per: "rows",
    n: shapes,
    typical: [1_000, 100_000],
    best: { bytes: 36, basis: "The kernel reads and writes each 12-byte position, and the upload writes it.", on: "gpu" },
    run: async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: device });
        try {
            await world.run(spawn);
            await world.run(slideFrame);
            return await timed(() => world.run(slideFrame));
        }
        finally {
            await world.dispose();
        }
    },
}];
