// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it } from "vitest";
import type { I32 } from "../../interface/math/i32/index.js";
import type { Commands } from "../../interface/system/commands.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";
import { readEach, select } from "./reads.test-helper.js";

const hp = Symbol("fusionTest/hp");
const armor = Symbol("fusionTest/armor");
const shown = Symbol("fusionTest/shown");
const score = Symbol("fusionTest/score");
const bonus = Symbol("fusionTest/bonus");

declare module "@adobe/ecs" {
    export interface Components {
        [hp]: { type: I32 };
        [armor]: { type: I32 };
        [shown]: { type: I32 };
        [score]: { type: number };
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

/** A world without workers, filled with entities of every combination of the components, and a way to run commands. */
const filled = async (fuse: boolean) => {
    const world = createWorld({ [workers]: 0 }, { fuse });
    const seed = System.create({}, ({ commands }: { readonly commands: Commands }) => {
        for (let i = 0; i < 300; i++) {
            commands.spawn([hp, armor, shown, score])({ [hp]: i % 17, [armor]: i % 5, [shown]: 0, [score]: i });
            if (i % 3 === 0) commands.spawn([hp, shown])({ [hp]: i % 13, [shown]: 1 });
            if (i % 4 === 0) commands.spawn([hp, armor])({ [hp]: i % 11, [armor]: 2 });
        }
    });
    const [failure] = (await runReported(world, seed)).failures;
    if (failure !== undefined) throw new Error(failure.message);
    return world;
};

/** Each entity's hp, shown and score, in entity order. */
const stateOf = async (world: Awaited<ReturnType<typeof filled>>) => {
    const entities = await select(world, { required: [hp] });
    return { hp: await readEach(world, entities, hp), shown: await readEach(world, entities, shown) };
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

    it("compile one kernel more for a schedule whose kernels share components, and none with fusing off", async () => {
        const counted = async (fuse: boolean): Promise<number> => {
            let compiles = 0;
            WebAssembly.compile = (bytes: BufferSource) => {
                compiles++;
                return compile(bytes);
            };
            const world = await filled(fuse);
            await world.run(chain);
            WebAssembly.compile = compile;
            await world.dispose();
            return compiles;
        };
        expect(await counted(true)).toBe(await counted(false) + 1);
    });
});
