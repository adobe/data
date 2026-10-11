import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Resource } from "../../resource/resource.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import type { World } from "../world.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";
import { bindKernel } from "./kernels.js";
import { createState } from "./state.js";

type Vec2 = readonly [number, number];
const vec2: Schema.ForType<Vec2> = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 };

const position = "wasmTest/position";
const velocity = "wasmTest/velocity";
const bounces = "wasmTest/bounces";
const flipped = "wasmTest/flipped";
const score = "wasmTest/score";
const seconds = "wasmTest/seconds";
const floor = "wasmTest/floor";

declare module "../../component/types.js" {
    export interface Types {
        [position]: Vec2;
        [velocity]: Vec2;
        [bounces]: number;
        [flipped]: boolean;
        [score]: number;
    }
}
declare module "../../resource/types.js" {
    export interface Types {
        [seconds]: number;
        [floor]: number;
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "wasmTest/seed": true;
        "wasmTest/integrate": true;
        "wasmTest/bounce": true;
        "wasmTest/tally": true;
        "wasmTest/scale": true;
        "wasmTest/main": true;
        "wasmTest/drift": true;
    }
}

Component.register(position, { ...vec2, layout: "storage" });
Component.register(velocity, vec2);
Component.register(bounces, { type: "integer", minimum: -2147483648, maximum: 2147483647 });
Component.register(flipped, { type: "boolean" });
Component.register(score, { type: "number" });
Resource.register(seconds, { type: "number", default: 1 / 60 });
Resource.register(floor, { type: "number", precision: 1, default: -2.5 });

const seed = System.create({ name: "wasmTest/seed", args: { type: "integer" } }, (_, { args }, commands) => {
    for (let i = 0; i < args; i++) {
        commands.spawn({ [position]: [i * 0.37, (i % 13) * 0.71], [velocity]: [Math.sin(i) * 3, Math.cos(i) * 5], [bounces]: 0, [flipped]: false, [score]: 0 });
    }
});

const halve = (value: number) => value * 0.5;

const integrate = System.create({
    name: "wasmTest/integrate",
    kernel: true,
    query: { read: [position, velocity], write: [position, velocity] },
    resources: { read: [seconds] },
}, (row, context) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    const t = context[seconds];
    row[velocity] = [vx * 0.999, vy - 9.8 * t];
    row[position] = [x + vx * t, y + halve(vy) * t * 2];
});

const bounce = System.create({
    name: "wasmTest/bounce",
    kernel: true,
    query: { read: [position, velocity, bounces, flipped], write: [position, velocity, bounces, flipped] },
    resources: { read: [floor] },
    after: ["wasmTest/integrate"],
}, (row, context) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    if (y < context[floor] && vy < 0) {
        row[position] = [x, context[floor] + Math.abs(y - context[floor])];
        row[velocity] = [vx, Math.min(-vy * 0.8, 40)];
        row[bounces] = row[bounces] + 1;
        row[flipped] = !row[flipped];
    }
    else if (x % 7 > 6.5) {
        row[flipped] = row[flipped] === true ? false : true;
    }
});

const tally = System.create({
    name: "wasmTest/tally",
    kernel: true,
    query: { read: [bounces, flipped, position], write: [score] },
    after: ["wasmTest/bounce"],
}, row => {
    let total = 0;
    for (let i = 0; i < 10; i++) {
        if (i === 7) break;
        if (i % 2 === 1) continue;
        total += i * row[bounces];
    }
    const [x] = row[position];
    row[score] = total + (row[flipped] ? Math.floor(x * 100) / 100 : Math.round(x) | 0) + (x > 3 && x < 9 ? 1 : 0);
});

const scale = System.create({
    name: "wasmTest/scale",
    kernel: true,
    args: { type: "number" },
    query: { read: [score], write: [score] },
}, (row, { args }) => {
    row[score] = row[score] * args;
});

/** Component-wise vector math: one f32x4 operation per row. */
const drift = System.create({
    name: "wasmTest/drift",
    kernel: true,
    query: { read: [position, velocity], write: [position] },
    resources: { read: [seconds] },
    after: ["wasmTest/tally"],
}, (row, context) => {
    const [x, y] = row[position];
    const [vx, vy] = row[velocity];
    const t = context[seconds];
    row[position] = [x + vx * t, y + vy * t];
});

const main = System.composite({ name: "wasmTest/main", systems: [integrate, bounce, tally, drift] });

const snapshot = (world: World): unknown[] => world.query.select([position]).map(entity => world.read.entity(entity, [position, velocity, bounces, flipped, score]));

const simulate = async (wasm: boolean, simd = false): Promise<unknown[]> => {
    const world = createWorld({ wasm, simd });
    await world.systems.register(seed, main, scale);
    await world.run(seed, 300);
    for (let frame = 0; frame < 120; frame++) {
        await world.run(main);
        if (frame % 30 === 0) await world.run(scale, 1.5);
    }
    const result = snapshot(world);
    await world.dispose();
    return result;
};

describe("WASM kernels", () => {
    it("are generated for every kernel here, with SIMD only where lanes line up", () => {
        const wasmOf = (system: typeof integrate | typeof bounce | typeof tally | typeof scale | typeof drift) => {
            const description = kernelOf(system);
            if (description === undefined) throw new Error("not compiled");
            return bindKernel(createState(), system, description).wasm;
        };
        expect([integrate, bounce, tally, scale, drift].map(system => wasmOf(system)?.vectorized)).toEqual([false, false, false, false, true]);
    });

    it("give bit-identical results to the JS kernels without SIMD", async () => {
        const javascript = await simulate(false);
        expect(javascript.some(values => JSON.stringify(values).includes("true"))).toBe(true);
        expect(await simulate(true)).toEqual(javascript);
    });

    it("stay within storage precision of the JS kernels with SIMD", async () => {
        const javascript = await simulate(false);
        const vector = await simulate(true, true);
        expect(vector).toHaveLength(javascript.length);
        const leaves = (value: unknown): number[] => JSON.stringify(value).match(/-?[\d.]+(?:e[-+]?\d+)?/g)?.map(Number) ?? [];
        const relative = leaves(vector).map((value, i) => Math.abs(value - leaves(javascript)[i]) / Math.max(1, Math.abs(leaves(javascript)[i])));
        expect(Math.max(...relative)).toBeLessThan(1e-4);
        expect(vector).not.toEqual(javascript);
    });
});
