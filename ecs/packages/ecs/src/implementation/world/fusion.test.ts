// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import type { F32 } from "../../interface/math/f32/index.js";
import type { I32 } from "../../interface/math/i32/index.js";
import type { Commands } from "../../interface/system/commands.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";
import { readEach, select } from "./reads.test-helper.js";
import { tablesAfterCollecting } from "./lifetime.test-helper.js";

const hp = Symbol("fusionTest/hp");
const armor = Symbol("fusionTest/armor");
const shown = Symbol("fusionTest/shown");
const score = Symbol("fusionTest/score");
const bonus = Symbol("fusionTest/bonus");
const level = Symbol("fusionTest/level");
const glow = Symbol("fusionTest/glow");
const counter = Symbol("fusionTest/counter");
const next = Symbol("fusionTest/next");
const copied = Symbol("fusionTest/copied");

declare module "@adobe/ecs" {
    export interface Components {
        [hp]: { type: I32 };
        [armor]: { type: I32 };
        [shown]: { type: I32 };
        [score]: { type: number };
        [level]: { type: F32 };
        [glow]: { type: F32 };
        [counter]: { type: I32 };
        [next]: { type: number };
        [copied]: { type: number };
    }
    export interface Resources {
        [bonus]: { type: number; default: 3 };
    }
}

const regenerate = System.create({ kernel: true, components: { with: [hp] } }, row => {
    row[hp] = row[hp] < 10 ? row[hp] + 2 : row[hp] - 1;
});
const hurt = System.create({ kernel: true, components: { with: [hp, armor] }, after: [regenerate] }, row => {
    if (row[hp] > row[armor]) row[hp] = row[hp] - row[armor];
});
const show = System.create({ kernel: true, components: { with: [hp, shown] }, after: [hurt] }, (row, { resources }) => {
    row[shown] = row[hp] > 5 ? row[hp] + resources[bonus] : 0;
});
/** Writes a component nothing in the group touches, in the tier the group's first member leaves. */
const tally = System.create({ kernel: true, components: { with: [score] } }, row => {
    row[score] += 0.5;
});
const chain = System.create([regenerate, hurt, show, tally]);
const raise = System.create({ kernel: true, components: { with: [level, glow] } }, row => {
    row[glow] = row[level] * 2;
});
/** Writes what the kernel before it writes, reading nothing. */
const mark = System.create({ kernel: true, components: { with: [level, glow] }, after: [raise] }, row => {
    row[glow] = 1;
});

/** Wraps at 32 bits, as its kernel's I32 arithmetic does. */
const advance = System.create({ kernel: true, components: { with: [counter, next] } }, row => {
    row[next] = row[counter] + 1;
});
/** Compiled as written, reading what `advance` writes. */
const copy = System.create({ components: { with: [next, copied] }, after: [advance] }, row => {
    row[copied] = row[next];
});

/** A world without workers, filled with entities of every combination of the components, and a way to run commands. */
const filled = async (fuse: boolean) => {
    const world = createWorld({ [workers]: 0 }, { fuse });
    const seed = System.create({}, ({ commands }: { readonly commands: Commands }) => {
        for (let i = 0; i < 300; i++) {
            commands.spawn([hp, armor, shown, score])({ [hp]: i % 17, [armor]: i % 5, [shown]: 0, [score]: i });
            if (i % 3 === 0) commands.spawn([hp, shown])({ [hp]: i % 13, [shown]: 1 });
            if (i % 4 === 0) commands.spawn([hp, armor])({ [hp]: i % 11, [armor]: 2 });
            commands.spawn([level, glow])({ [level]: i, [glow]: 0 });
        }
    });
    const [failure] = (await runReported(world, seed)).failures;
    if (failure !== undefined) throw new Error(failure.message);
    return world;
};

/** Each entity's hp, shown and score, in entity order. */
const stateOf = async (world: Awaited<ReturnType<typeof filled>>) => {
    const entities = await select(world, { required: [hp] });
    return { hp: await readEach(world, entities, hp), shown: await readEach(world, entities, shown), score: await readEach(world, entities, score) };
};

const compile = WebAssembly.compile;
afterEach(() => { WebAssembly.compile = compile; });

describe("fused kernels", () => {
    it("compute what the kernels compute one after another, in archetypes every member matches and the rest", async () => {
        const fused = await filled(true);
        const apart = await filled(false);
        for (let frame = 0; frame < 4; frame++) {
            await fused.run(chain);
            await apart.run(chain);
        }
        expect(await stateOf(fused)).toEqual(await stateOf(apart));
        await fused.dispose();
        await apart.dispose();
    });

    /** How many modules a world compiles running `system` once. */
    const counted = async (fuse: boolean, system: System): Promise<number> => {
        let compiles = 0;
        WebAssembly.compile = (bytes: BufferSource) => {
            compiles++;
            return compile(bytes);
        };
        const world = await filled(fuse);
        await world.run(system);
        WebAssembly.compile = compile;
        await world.dispose();
        return compiles;
    };

    it("compile one kernel more for a schedule whose kernels read components the ones before touch, and none with fusing off", async () => {
        expect(await counted(true, chain)).toBe(await counted(false, chain) + 1);
    });

    it("leave a kernel reading nothing the one before it touches to run alone", async () => {
        const pair = System.create([raise, mark]);
        expect(await counted(true, pair)).toBe(await counted(false, pair));
    });

    /** Runs `count` new composites of the chain beside a new system, each once, as a loop does as systems come and go. */
    const runBesideFresh = async (world: Awaited<ReturnType<typeof filled>>, count: number): Promise<void> => {
        for (let k = 0; k < count; k++) await world.run(System.create([chain, System.create(() => {})]));
    };

    it("keep a kernel's 32-bit arithmetic beside a kernel compiled as written, without SIMD", async () => {
        const pair = System.create([advance, copy]);
        const results = await Promise.all([true, false].map(async fuse => {
            const world = createWorld({ [workers]: 0 }, { fuse, simd: false });
            const seed = System.create({}, ({ commands }: { readonly commands: Commands }) => {
                for (let i = 0; i < 64; i++) commands.spawn([counter, next, copied])({ [counter]: 2147483647 - i % 2, [next]: 0, [copied]: 0 });
            });
            await runReported(world, seed);
            for (let frame = 0; frame < 4; frame++) await world.run(pair);
            const entities = await select(world, { required: [counter] });
            const values = { next: await readEach(world, entities, next), copied: await readEach(world, entities, copied) };
            await world.dispose();
            return values;
        }));
        const wrapped = Array.from({ length: 64 }, (_, i) => i % 2 === 0 ? -2147483648 : 2147483647);
        expect(results).toEqual([{ next: wrapped, copied: wrapped }, { next: wrapped, copied: wrapped }]);
    });

    it("hold the groups of the schedules that live, as systems beside them come and go", async () => {
        const world = await filled(true);
        await world.run(chain);
        await runBesideFresh(world, 1);
        const before = await tablesAfterCollecting(world);
        await runBesideFresh(world, 50);
        const after = await tablesAfterCollecting(world);
        expect(before.fusedGroups).toBeGreaterThan(0);
        expect(after.fusedGroups).toBe(before.fusedGroups);
        await world.dispose();
    });
});
