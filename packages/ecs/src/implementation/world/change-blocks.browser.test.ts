// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join } from "./create.js";

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
        [value]: { type: number };
        [at]: { type: number };
        [note]: { type: { readonly text: string } | null; thread: "changeBlocksGpuTest" };
    }
}
Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(at, { type: { type: "integer", minimum: 0, maximum: 0x7FFFFFFF } });
const text = { type: "object", properties: { text: { type: "string" } } } as const;
Component.register(note, { type: { anyOf: [text, { type: "null" }], default: { text: "none" } }, thread: "changeBlocksGpuTest" });

const rows = 4500;
let entities: Entity[] = [];
const seed = System.create({ name: "changeBlocksGpuTest/seed" }, ({ commands }) => {
    entities = [];
    for (let i = 0; i < rows; i++) entities.push(commands.spawn([value, at, note])({ [value]: 0, [at]: i }));
});
const raise = System.create({ name: "changeBlocksGpuTest/raise", kernel: "gpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});
const setValue = System.create({ name: "changeBlocksGpuTest/setValue", target: "entity", components: { write: [value] } }, (row, _context, input: { readonly entity: Entity }) => {
    row[value] += 1;
});
let found: number[] = [];
const there = System.create({ name: "changeBlocksGpuTest/there", components: { read: [at, note], changed: [value] } }, row => { if (row[note] !== undefined) found.push(row[at]); });

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

describe("chunk and block ticks after a GPU kernel's column stamp", () => {
    it("let a joined thread's filters find every row a GPU kernel wrote, then a row the CPU wrote", async () => {
        const world = createWorld({ [workers]: 0, [gpuDevice]: await device() });
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: ["changeBlocksGpuTest"] });
        try {
            await new Promise<void>(resolve => {
                const stop = world.threads(threads => {
                    if (threads.at(-1)?.status !== "joined") return;
                    queueMicrotask(() => stop());
                    resolve();
                });
            });
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
