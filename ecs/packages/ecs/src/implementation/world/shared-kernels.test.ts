// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity, System, workers } from "../../index.js";
import type { F32, I32, Vec2 } from "../../interface/math/index.js";
import { kernelOf } from "./attach-kernel.js";
import { bindKernel } from "./kernels.js";
import { createState } from "./state.js";
import { definitionOf } from "../../interface/registry/index.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";

const scale = Symbol("sharedKernelsTest/scale");
const cell = Symbol("sharedKernelsTest/cell");
const flag = Symbol("sharedKernelsTest/flag");
const value = Symbol("sharedKernelsTest/value");
const out = Symbol("sharedKernelsTest/out");
const steps = Symbol("sharedKernelsTest/steps");
const wide = Symbol("sharedKernelsTest/wide");
declare module "@adobe/ecs" {
    interface Components {
        [scale]: { type: F32; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [flag]: { type: boolean; shared: true };
        [value]: { type: F32 };
        [out]: { type: F32 };
        [steps]: { type: I32 };
        // A plain number, f64, which the GPU can't hold.
        [wide]: { type: number; shared: true };
    }
}

/** Rows in archetypes of three scales and cells, some flagged. */
const spawn = System.create(({ commands }) => {
    for (let k = 0; k < 64; k++) {
        const scaled = [0.1, 1.5, -3.25][k % 3];
        commands.spawn([scale, cell, flag, value, out, steps], { [scale]: scaled, [cell]: [k % 2, -7], [flag]: k % 4 === 0 })({ [value]: k * 0.7, [out]: 0, [steps]: 0 });
    }
});

// The same body, tried as a kernel and run as written: a kernel's result is the body's.
const compute = System.create({ components: { with: [scale, cell, flag, value, out, steps] } }, row => {
    const [x, y] = row[cell];
    row[out] = row[value] * row[scale] + x / 3 + (row[flag] ? 1 : 0);
    row[steps] = x * 1000 + y;
});
const written = System.create({ kernel: false, components: { with: [scale, cell, flag, value, out, steps] } }, row => {
    const [x, y] = row[cell];
    row[out] = row[value] * row[scale] + x / 3 + (row[flag] ? 1 : 0);
    row[steps] = x * 1000 + y;
});

/** Moving rows to another scale, which only a system run as written does: tried as a kernel, it runs as written. */
const moving = System.create({ components: { with: [value] } }, (row, { commands }) => {
    commands.add(row.entity, scale, 2);
});

/** A GPU kernel reading an f64 shared value, which it can't run in any world. */
const wideOnGpu = System.create({ kernel: "gpu", components: { with: [wide, out] } }, row => {
    row[out] = row[wide];
});

/** Every row's results, by its value. */
const results = async (world: ReturnType<typeof createWorld>): Promise<readonly string[]> => {
    const read: [number, string][] = [];
    await world.run(System.create({ readonly: true, components: { with: [value, out, steps] } }, row => { read.push([row[value], `${row[out]} ${row[steps]}`]); }));
    return read.sort((a, b) => a[0] - b[0]).map(([, text]) => text);
};

describe("a kernel reading a shared component", () => {
    it("takes the call's archetype's value as a parameter, not a column", () => {
        const description = kernelOf(compute);
        expect(description?.shared).toEqual([scale, cell, flag]);
        expect(description?.columns.some(column => column.kind === "field" && [scale, cell, flag].some(key => key === column.component))).toBe(false);
        expect(description?.program).not.toBeNull();
    });
    for (const wasm of [false, true]) {
        it(`gives the body's results, bit for bit, in ${wasm ? "WASM" : "JS"}`, async () => {
            const expected = await (async () => {
                await using world = createWorld({ [workers]: 0 }, { wasm });
                await world.run(spawn);
                await world.run(written);
                return results(world);
            })();
            await using world = createWorld({ [workers]: 0 }, { wasm });
            await world.run(spawn);
            await world.run(compute);
            expect(await results(world)).toEqual(expected);
            expect(new Set(expected).size).toBeGreaterThan(6);
        });
    }
    it("can't write it, nor issue commands of it", async () => {
        expect(() => System.create({ kernel: false, components: { with: [scale, value] } }, row => {
            // @ts-expect-error a shared component's value is its archetype's
            row[scale] = 2;
        })).toThrow(`writes "sharedKernelsTest/scale", a shared component`);
        expect(kernelOf(moving)).toBeUndefined();
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        expect((await runReported(world, moving)).failures).toEqual([]);
        const scales: number[] = [];
        await world.run(System.create({ readonly: true, components: { with: [scale] } }, row => { scales.push(row[scale]); }));
        expect(new Set(scales)).toEqual(new Set([2]));
        // A kernel built without knowing a component is shared, naming it in a command, fails where it registers.
        const description = kernelOf(compute);
        if (description === undefined) throw new Error("not a kernel");
        const state = createState();
        const leaf = definitionOf(compute);
        if (leaf === undefined || leaf.kind === "composite") throw new Error("not a leaf");
        expect(() => bindKernel(state, leaf, { ...description, keys: [scale] })).toThrow(`its commands name "sharedKernelsTest/scale", a shared component`);
        void Entity.none;
    });
    it("can't run on the GPU when it reads an f64 shared value, as for an f64 column", async () => {
        await using world = createWorld({ [workers]: 0 });
        await expect(world.run(wideOnGpu)).rejects.toThrow("can't run on the GPU: it reads an f64 value");
    });
});

