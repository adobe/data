// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 } from "../../interface/math/i32/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";

/** Kernels a schedule would fuse, run with pool workers: built in node and from source in chromium. */

const hp = Symbol("fusionWorkersTest/hp");
const armor = Symbol("fusionWorkersTest/armor");
const shown = Symbol("fusionWorkersTest/shown");

declare module "@adobe/ecs" {
    export interface Components {
        [hp]: { type: I32 };
        [armor]: { type: I32 };
        [shown]: { type: I32 };
    }
}

const rows = 20000;

const seed = System.create({}, ({ commands }) => {
    // Rows of hp alone, which only the first kernel runs over, split the pool's chunks differently for it.
    for (let i = 0; i < 1000; i++) commands.spawn([hp])({ [hp]: i % 7 });
    for (let i = 0; i < rows; i++) commands.spawn([hp, armor, shown])({ [hp]: i % 17, [armor]: i % 5, [shown]: 0 });
});
const regenerate = System.create({ kernel: true, components: { with: [hp] } }, row => {
    row[hp] = row[hp] < 10 ? row[hp] + 2 : row[hp] - 1;
});
const hurt = System.create({ kernel: true, components: { with: [hp, armor] }, after: [regenerate] }, row => {
    if (row[hp] > row[armor]) row[hp] = row[hp] - row[armor];
});
const show = System.create({ kernel: true, components: { with: [hp, shown] }, after: [hurt] }, row => {
    row[shown] = row[hp] * 3;
});
const chain = System.create([regenerate, hurt, show]);

/** Each entity's hp and shown after some frames of the chain, with pool workers and fusing on or off. */
export const chainOnWorkers = async (fuse: boolean): Promise<{ readonly hp: readonly (number | null)[]; readonly shown: readonly (number | null)[] }> => {
    const world = createWorld({ [workers]: 2 }, { fuse, minimumChunk: 64 });
    try {
        await world.run(seed);
        for (let frame = 0; frame < 6; frame++) await world.run(chain);
        const entities = await select(world, { required: [hp] });
        return { hp: await readEach(world, entities, hp), shown: await readEach(world, entities, shown) };
    }
    finally {
        await world.dispose();
    }
};
