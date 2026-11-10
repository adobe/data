// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { readResource } from "./reads.test-helper.js";

/** A kernel writing a small typed array's elements, with pool workers: built in node and from source in chromium. */

const cell = Symbol("contendedArraysTest/cell");
const cells = Symbol("contendedArraysTest/cells");

declare module "@adobe/ecs" {
    export interface Components {
        [cell]: { type: number };
    }
    export interface Resources {
        [cells]: { type: Uint32Array; length: 64 };
    }
}

const rows = 40000;

const seed = System.create({}, ({ commands }) => {
    for (let i = 0; i < rows; i++) commands.spawn([cell])({ [cell]: i });
});
const mark = System.create({ kernel: true, components: { with: [cell] } }, (row, { resources }) => {
    resources[cells][row[cell] % 64] = row[cell];
});

/** Each cell's value after the kernel, run with pool workers, and the value each holds when rows write in order. */
export const cellsOnWorkers = async (): Promise<{ readonly written: readonly number[]; readonly inOrder: readonly number[] }> => {
    const world = createWorld({ [workers]: 4 }, { minimumChunk: 64 });
    try {
        await world.run(seed);
        // The first runs start the pool.
        for (let run = 0; run < 3; run++) await world.run(mark);
        return { written: [...await readResource(world, cells)], inOrder: Array.from({ length: 64 }, (_, k) => rows - 64 + k) };
    }
    finally {
        await world.dispose();
    }
};
