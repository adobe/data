import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

type Vec2 = readonly [number, number];
const vec2 = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } as const satisfies Schema;
const position = Symbol("dispatchTest/position");
const velocity = Symbol("dispatchTest/velocity");
const offset = Symbol("dispatchTest/offset");
const tagA = Symbol("dispatchTest/a");
const tagB = Symbol("dispatchTest/b");
const tagC = Symbol("dispatchTest/c");
const tagD = Symbol("dispatchTest/d");
const tagE = Symbol("dispatchTest/e");
const tagF = Symbol("dispatchTest/f");
const tagG = Symbol("dispatchTest/g");
const tags = [tagA, tagB, tagC, tagD, tagE, tagF, tagG] as const;
declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
        [offset]: typeof offsetTraits;
        [tagA]: typeof tagATraits; [tagB]: typeof tagBTraits; [tagC]: typeof tagCTraits; [tagD]: typeof tagDTraits;
        [tagE]: typeof tagETraits; [tagF]: typeof tagFTraits; [tagG]: typeof tagGTraits;
    }
}
const positionTraits = Component.register(position, { type: vec2 });
const velocityTraits = Component.register(velocity, { type: vec2 });
const offsetTraits = Component.register(offset, { type: { type: "number", precision: 1 } });
const tagATraits = Component.register(tagA, { type: { const: true } });
const tagBTraits = Component.register(tagB, { type: { const: true } });
const tagCTraits = Component.register(tagC, { type: { const: true } });
const tagDTraits = Component.register(tagD, { type: { const: true } });
const tagETraits = Component.register(tagE, { type: { const: true } });
const tagFTraits = Component.register(tagF, { type: { const: true } });
const tagGTraits = Component.register(tagG, { type: { const: true } });

const scatter = System.create({ name: "dispatchTest/scatter" }, ({ commands }) => {
    for (let i = 0; i < 128 * 64; i++) {
        const components: (typeof position | typeof velocity | typeof offset | (typeof tags)[number])[] = [position, velocity, offset];
        tags.forEach((tag, bit) => { if (((i >> 6) & (1 << bit)) !== 0) components.push(tag); });
        commands.spawn(components)({ [position]: [i, 0], [velocity]: [1, i % 5], [offset]: 0 });
    }
});
const seed = System.create({ name: "dispatchTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 4096; i++) commands.spawn([position, velocity, offset])({ [position]: [i, 0], [velocity]: [1, i % 5], [offset]: 0 });
});
const fastA = System.create({ name: "dispatchTest/fastA", kernel: "cpu", components: { read: [velocity], write: [position] } }, row => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    row[position] = [x + vx, y + vy];
});
// Commands make it a JS kernel, dispatched by message.
const slowB = System.create({ name: "dispatchTest/slowB", kernel: "cpu", components: { read: [velocity] } }, (row, { commands }) => {
    const [vx] = row[velocity];
    if (vx > 100) commands.despawn(row.entity);
});
const fastC = System.create({ name: "dispatchTest/fastC", kernel: "cpu", components: { read: [velocity], write: [offset] } }, row => {
    const [vx, vy] = row[velocity];
    row[offset] = vx + vy;
});

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> =>
    Promise.race([promise, new Promise<"timeout">(resolve => setTimeout(() => resolve("timeout"), ms))]);

const grow = System.create({ name: "dispatchTest/seed/2" }, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn([position, velocity, offset])({ [position]: [i, 1], [velocity]: [2, i % 3], [offset]: 0 });
});
let observedRows = 0;
const bump = System.create({ name: "dispatchTest/fastA/2", kernel: "cpu", components: { write: [offset] } }, row => {
    row[offset] = row[offset] + 1;
});
const watch = System.create({ name: "dispatchTest/slowB/2", components: { changed: [offset] } }, () => { observedRows++; });
const later = System.create({ name: "dispatchTest/fastC/2", kernel: "cpu", components: { read: [velocity], write: [offset] }, after: [watch] }, row => {
    const [vx, vy] = row[velocity];
    row[offset] = vx + vy;
});
describe("worker dispatch", () => {
    it("reloads kernels on workers when an observer registers", async () => {
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
        await world.run(seed);
        await world.run(bump);
        await world.run(watch);
        observedRows = 0;
        await world.run(bump);
        await world.run(watch);
        expect(observedRows).toBe(4096);
    }, 200000);
    it("keeps worker kernels in step after a failed registration", async () => {
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
        await world.run(seed);
        await world.run(bump);
        const original = WebAssembly.compile;
        let calls = 0;
        WebAssembly.compile = (bytes: BufferSource) => (++calls === 2 ? Promise.reject(new Error("injected")) : original(bytes));
        await expect(world.run(System.composite({ name: "dispatchTest/tier/2", systems: [watch, later] }))).rejects.toThrow("injected");
        WebAssembly.compile = original;
        await world.run(watch);
        observedRows = 0;
        await world.run(bump);
        await world.run(watch);
        expect(observedRows).toBe(4096);
    }, 200000);
    it("delivers layouts between back-to-back runs", async () => {
        const go = async (count: number, wasm = true, delay = false) => {
            const world = createWorld({ [workers]: count }, { minimumChunk: 64, wasm });
            for (let frame = 0; frame < 12; frame++) {
                const r = await withTimeout((async () => { await world.run(grow); if (delay) await new Promise(r => setTimeout(r, 30)); await world.run(fastA); })(), 3000);
                if (r === "timeout") return "timeout";
            }
            return (await readEach(world, await select(world, { required: [position] }), position)).map(each => JSON.stringify(each)).sort();
        };
        const alone = await go(0);
        const diff = (a: unknown, b: unknown) => a === "timeout" || b === "timeout" ? "timeout" : (a as string[]).filter((v, i) => v !== (b as string[])[i]).length;
        const results = [diff(await go(3, false), alone), diff(await go(0, true), alone)];
        for (let i = 0; i < 2; i++) results.push(diff(await go(3), alone));
        for (let i = 0; i < 2; i++) results.push(diff(await go(3, true, true), alone));
        expect(results).toEqual([0, 0, 0, 0, 0, 0]);
    }, 200000);
    for (const [name, systems] of [["dispatchTest/tier", [fastA, slowB]], ["dispatchTest/tier/3", [fastA, fastC]], ["dispatchTest/tier/4", [slowB, fastC]]] as const) it(`runs tiers of ${systems.map(s => s.name).join(",")}`, async () => {
        const tier = System.composite({ name, systems: [...systems] });
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
        await world.run(seed);
        let result: unknown = "ok";
        for (let frame = 0; frame < 50 && result !== "timeout"; frame++) result = await withTimeout(world.run(tier), 3000);
        expect(result).not.toBe("timeout");
    }, 200000);
    it("fast, message, fast kernels in one tier don't hang", async () => {
        const tier = System.composite({ name: "dispatchTest/tier/5", systems: [fastA, slowB, fastC] });
        const world = createWorld({ [workers]: 2 }, { minimumChunk: 64 });
        await world.run(seed);
        let result: unknown = "ok";
        for (let frame = 0; frame < 50 && result !== "timeout"; frame++) result = await withTimeout(world.run(tier), 3000);
        expect(result).not.toBe("timeout");
    }, 200000);

    it("ring overflow followed by a message task in the same tier doesn't hang", async () => {
        const tier = System.composite({ name: "dispatchTest/tier/6", systems: [fastA, slowB] });
        const world = createWorld({ [workers]: 1 }, { minimumChunk: 64 });
        await world.run(scatter);
        let result: unknown = "ok";
        for (let frame = 0; frame < 5 && result !== "timeout"; frame++) result = await withTimeout(world.run(tier), 3000);
        expect(result).not.toBe("timeout");
    }, 200000);
});
