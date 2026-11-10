// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import type { Commands } from "../../interface/system/commands.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";
import { readResource } from "./reads.test-helper.js";

const cells = Symbol("typedArrayResourcesTest/cells");
const levels = Symbol("typedArrayResourcesTest/levels");
const clamped = Symbol("typedArrayResourcesTest/clamped");
const frame = Symbol("typedArrayResourcesTest/frame");
const cell = Symbol("typedArrayResourcesTest/cell");
const level = Symbol("typedArrayResourcesTest/level");

declare module "@adobe/ecs" {
    interface Resources {
        [cells]: { type: Uint8Array; length: 16 };
        [levels]: { type: Int16Array; length: 8 };
        [clamped]: { type: Uint8ClampedArray; length: 5 };
        [frame]: { type: Uint8Array; length: 1048576 };
    }
    interface Components {
        [cell]: { type: number };
        [level]: { type: number };
    }
}

/** A world without workers, and a way to run commands in it. */
const withCommands = (options: { readonly wasm?: boolean } = {}) => {
    const world = createWorld({ [workers]: 0 }, options);
    let body: (commands: Commands) => void = () => {};
    const issue = System.create({}, ({ commands }) => body(commands));
    const run = async (next: (commands: Commands) => void): Promise<void> => {
        body = next;
        const [failure] = (await runReported(world, issue)).failures;
        if (failure !== undefined) throw new Error(failure.message);
    };
    return { world, run };
};

const mark = System.create({ components: { with: [cell] } }, (row, { resources }) => { resources[cells][row[cell]] = row[cell] + 100; });
const marked: number[] = [];
const readChanged = System.create({ resources: { changed: [cells] } }, ({ resources }) => { marked.push(resources[cells][3]); });
/** Advances cell 2 once a run that cells changed since its last. */
const advanceChanged = System.create({ resources: { changed: [cells] } }, ({ resources }) => { resources[cells][2] = resources[cells][2] + 1; });

/** Writes each row's level at its cell, beyond the ends doing nothing; of two rows writing one cell, either. */
const paint = System.create({ kernel: true, components: { with: [cell, level] } }, (row, { resources }) => { resources[levels][row[cell]] = row[level]; });
/** Copies each cell's level, NaN past the end, into the row. */
const sample = System.create({ kernel: true, components: { with: [cell, level] } }, (row, { resources }) => { row[level] = resources[levels][row[cell]] + 0.5; });
/** Numbers each row from the counter at cell 0, which it advances. */
const count = System.create({ kernel: true, components: { with: [cell, level] } }, (row, { resources }) => {
    const before = resources[cells][0];
    resources[cells][0] = before + 1;
    row[level] = before;
});
/** Advances cell 1 once per row, reading it at a literal index. */
const tallyRows = System.create({ kernel: true, components: { with: [cell] } }, (row, { resources }) => { resources[cells][1] = resources[cells][1] + 1; });
const clamp = System.create({ kernel: true, components: { with: [cell, level] } }, (row, { resources }) => { resources[clamped][row[cell]] = row[level]; });

describe("typed array resources", () => {
    it("start as their length of zeros in each world, and read as a copy outside systems", async () => {
        const first = withCommands();
        const second = withCommands();
        await first.run(commands => { for (let i = 0; i < 4; i++) commands.spawn([cell])({ [cell]: i }); });
        await first.world.run(mark);
        await second.world.run(mark);
        const firstCells = await readResource(first.world, cells);
        expect([...firstCells]).toEqual([100, 101, 102, 103, ...new Array<number>(12).fill(0)]);
        expect([...await readResource(second.world, cells)]).toEqual(new Array<number>(16).fill(0));
        expect(firstCells).toBeInstanceOf(Uint8Array);
        await first.world.run(mark);
        expect(firstCells[0]).toBe(100);
        await first.world.dispose();
        await second.world.dispose();
    });

    it("hold one row of their elements: a world with a 1 MiB one holds under 4 MiB of its arena", async () => {
        const world = createWorld({ [workers]: 0 });
        expect((await readResource(world, frame)).length).toBe(1048576);
        expect((await world.tables()).arena).toBeLessThan(4 * 1048576);
        await world.dispose();
    });

    it("count as changed in a run of a system writing their elements", async () => {
        const { world, run } = withCommands();
        await run(commands => { for (let i = 0; i < 4; i++) commands.spawn([cell])({ [cell]: i }); });
        marked.length = 0;
        await world.run(readChanged);
        await world.run(readChanged);
        await world.run(mark);
        await world.run(readChanged);
        await world.run(readChanged);
        expect(marked).toEqual([0, 103]);
        await world.dispose();
    });

    it("pass the change filter of a system writing them by changes before its run, not its own", async () => {
        const { world, run } = withCommands();
        await run(commands => { for (let i = 0; i < 4; i++) commands.spawn([cell])({ [cell]: i }); });
        await world.run(advanceChanged);
        await world.run(advanceChanged);
        await world.run(advanceChanged);
        expect((await readResource(world, cells))[2]).toBe(1);
        await world.run(mark);
        await world.run(advanceChanged);
        await world.run(advanceChanged);
        expect((await readResource(world, cells))[2]).toBe(103);
        await world.dispose();
    });

    for (const wasm of [true, false]) {
        it(`are written in place by a kernel's rows, past their ends doing nothing, and read NaN there${wasm ? "" : ", in JS"}`, async () => {
            const { world, run } = withCommands({ wasm });
            await run(commands => {
                const spawn = commands.spawn([cell, level]);
                // Cell 2 is written twice, by either row last; 9 and -1 are past the ends; 1.5 is no index.
                for (const [at, value] of [[0, 7], [2, -3], [2, 40000], [7, 12], [9, 5], [-1, 6], [1.5, 8]]) spawn({ [cell]: at, [level]: value });
            });
            await world.run(paint);
            const written = [...await readResource(world, levels)];
            expect([-3, new Int16Array([40000])[0]]).toContain(written[2]);
            expect(written.filter((_, cell) => cell !== 2)).toEqual([7, 0, 0, 0, 0, 0, 12]);
            await world.run(sample);
            const levelsRead: number[] = [];
            const collect = System.create({ components: { with: [cell, level] } }, row => { levelsRead.push(row[level]); });
            await world.run(collect);
            expect(levelsRead).toEqual([7.5, (written[2] ?? NaN) + 0.5, (written[2] ?? NaN) + 0.5, 12.5, NaN, NaN, NaN]);
            await world.dispose();
        });
    }

    for (const wasm of [true, false]) {
        it(`are read at a literal index as they are where read, by a const held across a write to them too${wasm ? "" : ", in JS"}`, async () => {
            const { world, run } = withCommands({ wasm });
            await run(commands => { for (let i = 0; i < 3; i++) commands.spawn([cell, level])({ [cell]: i, [level]: -1 }); });
            await world.run(count);
            await world.run(tallyRows);
            const levelsRead: number[] = [];
            await world.run(System.create({ components: { with: [cell, level] } }, row => { levelsRead.push(row[level]); }));
            expect(levelsRead).toEqual([0, 1, 2]);
            expect([...await readResource(world, cells)].slice(0, 2)).toEqual([3, 3]);
            await world.dispose();
        });
    }

    it("convert as the typed array does: clamped, rounded half to even, NaN as 0", async () => {
        for (const wasm of [true, false]) {
            const { world, run } = withCommands({ wasm });
            await run(commands => {
                const spawn = commands.spawn([cell, level]);
                for (const [at, value] of [[0, 300], [1, 2.5], [2, 3.5], [3, NaN], [4, -4]]) spawn({ [cell]: at, [level]: value });
            });
            await world.run(clamp);
            expect([...await readResource(world, clamped)]).toEqual([255, 2, 4, 0, 0]);
            await world.dispose();
        }
    });
});
