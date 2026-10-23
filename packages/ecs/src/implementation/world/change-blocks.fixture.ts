// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { I32 } from "../../interface/math/i32/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import type { U32 } from "../../interface/math/index.js";

/** Scenarios of chunk and block ticks on workers, run built in node and from source in chromium. */

const value = Symbol("changeBlocksWorkersTest/value");
const at = Symbol("changeBlocksWorkersTest/at");
const seen = Symbol("changeBlocksWorkersTest/seen");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
        [at]: { type: U32 };
        [seen]: { type: number };
    }
}


const rows = 4500;

const seed = System.create({ name: "changeBlocksWorkersTest/seed" }, ({ commands }) => {
    for (let i = 0; i < rows; i++) commands.spawn([value, at, seen])({ [value]: 0, [at]: i, [seen]: 0 });
});

/** Writes the rows whose `at` is one of three, stamping row by row. */
const writeSome = System.create({ name: "changeBlocksWorkersTest/writeSome", kernel: "cpu", components: { read: [at], write: [value] } }, (row, _context, input: { readonly a: I32; readonly b: I32; readonly c: I32 }) => {
    const here = row[at];
    if (here === input.a || here === input.b || here === input.c) row[value] += 1;
});

/** Counts each run of the rows whose value changed. */
const watch = System.create({ name: "changeBlocksWorkersTest/watch", kernel: "cpu", components: { write: [seen], changed: [value] } }, row => {
    row[seen] += 1;
});

let found: number[] = [];
const onMain = System.create({ name: "changeBlocksWorkersTest/onMain", components: { read: [at], changed: [value] } }, row => { found.push(row[at]); });

/**
 * The rows a kernel on workers and a system on the world's thread find after a kernel on workers wrote three rows far
 * apart: in the first block, a middle block of a middle chunk, and the last row.
 */
export const foundOnWorkers = async (wasm: boolean): Promise<{ readonly kernel: readonly number[]; readonly main: readonly number[] }> => {
    const world = createWorld({ [workers]: 2 }, { wasm, minimumChunk: 64 });
    try {
        await world.run(seed);
        await world.run(watch);
        await world.run(onMain);
        const all = await select(world, { required: [seen] });
        const before = await readEach(world, all, seen);
        await world.run(writeSome, { a: 5, b: 2048 + 5 * 64 + 9, c: rows - 1 });
        await world.run(watch);
        found = [];
        await world.run(onMain);
        const after = await readEach(world, all, seen);
        const ats = await readEach(world, all, at);
        return {
            kernel: all.flatMap((_, k) => after[k] !== before[k] ? [ats[k] ?? -1] : []).sort((a, b) => a - b),
            main: [...found].sort((a, b) => a - b),
        };
    }
    finally {
        await world.dispose();
    }
};
