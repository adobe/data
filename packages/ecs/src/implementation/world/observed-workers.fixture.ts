// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import type { F32 } from "../../interface/math/index.js";

/** Scenarios of tick stamps on workers, run built in node and from source in chromium. */

const value = Symbol("observedWorkersTest/value");
const seen = Symbol("observedWorkersTest/seen");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: F32 };
        [seen]: { type: F32 };
    }
}


const seed = System.create({}, ({ commands }) => {
    for (let i = 0; i < 3000; i++) commands.spawn([value, seen])({ [value]: i, [seen]: 0 });
});

/** Writes every value: until something observes `value`, its stamps are muted. */
const bump = System.create({ kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

const watch = System.create({ kernel: "cpu", components: { write: [seen], changed: [value] }, after: [bump] }, row => {
    row[seen] = row[seen] + 1;
});

/** The distinct counts each row's observer saw: after it registered, and after one more write. */
export const observedOnWorkers = async (wasm: boolean): Promise<readonly (readonly number[])[]> => {
    const world = createWorld({ [workers]: 2 }, { wasm, minimumChunk: 64 });
    try {
        await world.run(seed);
        await world.run(bump);
        const seenAll = async (): Promise<number[]> => [...new Set((await readEach(world, await select(world, { required: [seen] }), seen)).map(each => each ?? -1))];
        // New observers see everything once.
        await world.run(watch);
        await world.run(watch);
        const first = await seenAll();
        // Writes after registering are stamped, so the observer sees each exactly once.
        await world.run(bump);
        await world.run(watch);
        await world.run(watch);
        return [first, await seenAll()];
    }
    finally {
        await world.dispose();
    }
};
