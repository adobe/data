// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join } from "./create.js";
import type { F32, U32 } from "../../interface/math/index.js";

// A GPU kernel stamps a whole column once; before a joined thread's systems filter on it, its rows, chunks and blocks
// take the stamp, so the thread's change filters find every row, and then only rows written after.

const value = Symbol("changeBlocksGpuTest/value");
const at = Symbol("changeBlocksGpuTest/at");
const note = Symbol("changeBlocksGpuTest/note");

declare module "@adobe/ecs" {
    interface Threads {
        changeBlocksGpuTest: true;
    }
    interface Components {
        [value]: { type: F32 };
        [at]: { type: U32 };
        [note]: { type: { readonly text: string } | null; thread: "changeBlocksGpuTest"; default: { text: "none" } };
    }
}
const text = { type: "object", properties: { text: { type: "string" } } } as const;

const rows = 4500;
let entities: Entity[] = [];
const seed = System.create({}, ({ commands }) => {
    entities = [];
    for (let i = 0; i < rows; i++) entities.push(commands.spawn([value, at, note])({ [value]: 0, [at]: i }));
});
const raise = System.create({ kernel: "gpu", components: { with: [value] } }, row => {
    row[value] = row[value] + 1;
});
const setValue = System.create({ target: "entity", components: { with: [value] } }, (row, _context, input: { readonly entity: Entity }) => {
    row[value] += 1;
});
let found: number[] = [];
const there = System.create({ components: { with: [at, note], changed: [value] } }, row => { if (row[note] !== undefined) found.push(row[at]); });

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

describe("chunk and block ticks after a GPU kernel's column stamp", () => {
    it("let a joined thread's filters find every row a GPU kernel wrote, then a row the CPU wrote", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        const channel = new MessageChannel();
        const shared = world.share(channel.port1);
        const remote = await join(channel.port2, { threads: ["changeBlocksGpuTest"] });
        try {
            await shared;
            await world.run(seed);
            await world.run(there);
            await world.run(raise);
            found = [];
            await world.run(there);
            expect(found.length).toBe(rows);
            const row = 2 * 1024 + 5 * 64 + 9;
            await world.run(setValue, { entity: entities[row] });
            found = [];
            await world.run(there);
            expect(found).toEqual([row]);
        }
        finally {
            await remote.dispose();
            await world.dispose();
        }
    });
});
