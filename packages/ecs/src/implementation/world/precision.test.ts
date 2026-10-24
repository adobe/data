// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32 } from "../../interface/math/index.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";

const a = Symbol("precisionTest/a");
const c = Symbol("precisionTest/c");
const difference = Symbol("precisionTest/difference");

declare module "@adobe/ecs" {
    export interface Components {
        [a]: { type: F32 };
        [c]: { type: F32 };
        [difference]: { type: F32 };
    }
}

// a * a is 1 + 2⁻²² + 2⁻⁴⁶, which f32 rounds to c, so only arithmetic at f64 keeps the 2⁻⁴⁶.
const seed = System.create(({ commands }) => {
    for (let i = 0; i < 64; i++) commands.spawn([a, c, difference])({ [a]: 1 + 2 ** -23, [c]: 1 + 2 ** -22, [difference]: 0 });
});
const tried = System.create({ components: { read: [a, c], write: [difference] } }, row => {
    row[difference] = row[a] * row[a] - row[c];
});
const written = System.create({ kernel: false, components: { read: [a, c], write: [difference] } }, row => {
    row[difference] = row[a] * row[a] - row[c];
});
const seen: number[] = [];
const read = System.create({ kernel: false, components: { read: [difference] } }, row => {
    seen.push(row[difference]);
});

const differenceAfter = async (system: typeof tried, wasm: boolean): Promise<number | undefined> => {
    const world = createWorld({ [workers]: 0 }, { wasm });
    try {
        await world.run(seed);
        await world.run(system);
        seen.length = 0;
        await world.run(read);
        return seen[0];
    }
    finally {
        await world.dispose();
    }
};

it("computes an unflagged kernel at the precision the body as written does, in JS and WASM", async () => {
    expect(kernelOf(tried)).toBeDefined();
    const expected = await differenceAfter(written, true);
    expect(expected).toBe(Math.fround(2 ** -46));
    expect(await differenceAfter(tried, true)).toBe(expected);
    expect(await differenceAfter(tried, false)).toBe(expected);
});
