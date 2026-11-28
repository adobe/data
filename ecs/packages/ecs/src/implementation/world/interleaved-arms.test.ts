// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import type { F32, I32, U32 } from "../../interface/math/index.js";
import { definitionOf } from "../../interface/registry/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";
import { bindKernel } from "./kernels.js";
import { readEach, select } from "./reads.test-helper.js";
import { createState } from "./state.js";

const state = Symbol("interleavedArmsTest/state");
const direction = Symbol("interleavedArmsTest/direction");
declare module "@adobe/ecs" {
    export interface Components {
        [state]: { type: { readonly step: I32; readonly rng: readonly [U32, U32, U32, U32] } };
        [direction]: { type: { readonly x: F32; readonly y: F32 } };
    }
}

type Random = readonly [U32, U32, U32, U32];
/** xoshiro128**, as the ecs_benchmark suite's systems draw numbers. */
const next = (s: Random): { readonly value: U32; readonly state: Random } => {
    const scrambled = Math.imul(s[1], 5);
    const t = s[1] << 9, t2 = s[2] ^ s[0], t3 = s[3] ^ s[1];
    return { value: Math.imul((scrambled << 7) | (scrambled >>> 25), 9) >>> 0, state: [(s[0] ^ t3) >>> 0, (s[1] ^ t2) >>> 0, (t2 ^ t) >>> 0, ((t3 << 11) | (t3 >>> 21)) >>> 0] };
};
const range = (s: Random, low: number, high: number): { readonly value: U32; readonly state: Random } => {
    const step = next(s);
    return { value: (step.value % (high - low + 1)) + low, state: step.state };
};

const spawn = System.create({}, ({ commands }, input: { readonly pattern: number }) => {
    for (let i = 0; i < 1001; i++) {
        const taken = input.pattern === 0 ? true : input.pattern === 1 ? false : ((Math.imul(i, 0x9e3779b1) >>> 16) & 3) === 0;
        commands.spawn([state, direction])({ [state]: { step: taken ? 10 * i : 10 * i + 1, rng: [i + 1, 2 * i + 3, 0x9e3779b9 ^ i, 7] }, [direction]: { x: 0, y: 0 } });
    }
});

/** Two draws in each arm, more than the interleaved loop runs for every group, taken by rows whose step is a tenth. */
const steer = System.create({ kernel: true, components: { with: [state, direction] } }, row => {
    const value = row[state];
    if (value.step % 10 === 0) {
        if (value.rng[0] > value.rng[1]) {
            const x = range(value.rng, 3, 19);
            const y = range(x.state, 0, 5);
            row[direction] = { x: x.value - 10, y: y.value };
            row[state] = { step: value.step, rng: y.state };
        }
        else {
            const x = range(value.rng, 0, 5);
            const y = range(x.state, 3, 19);
            row[direction] = { x: x.value, y: y.value - 10 };
            row[state] = { step: value.step, rng: y.state };
        }
    }
});

it("runs large arms four rows at a time, skipped where no row of a group takes them, as one row at a time does", async () => {
    const definition = definitionOf(steer);
    const description = kernelOf(steer);
    if (definition === undefined || definition.kind === "composite" || description === undefined) throw new Error("not a compiled leaf");
    expect(bindKernel(createState(), definition, description).wasm?.lanes).toBe("interleaved");
    for (const pattern of [0, 1, 2]) {
        const results = [];
        for (const simd of [false, true]) {
            await using world = createWorld({ [workers]: 0 }, { simd });
            await world.run(spawn, { pattern });
            await world.run(steer);
            await world.run(steer);
            const entities = await select(world, { required: [state] });
            results.push([await readEach(world, entities, state), await readEach(world, entities, direction)]);
        }
        expect([pattern, results[1]]).toEqual([pattern, results[0]]);
        const moved = (results[0]?.[1] ?? []).filter(value => JSON.stringify(value) !== '{"x":0,"y":0}').length;
        expect([pattern, pattern === 0 ? moved > 900 : pattern === 1 ? moved === 0 : moved > 100 && moved < 500]).toEqual([pattern, true]);
    }
});
