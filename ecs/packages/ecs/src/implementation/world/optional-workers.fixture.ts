// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { runReported } from "./outcomes.test-helper.js";

/** Kernels with an optional component on workers, over archetypes that have it and one that doesn't. */

const position = Symbol("optionalWorkersTest/position");
const velocity = Symbol("optionalWorkersTest/velocity");
declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
    }
}

const rows = 200;
const spawn = System.create(({ commands }) => {
    for (let i = 0; i < rows; i++) {
        commands.spawn([position])({ [position]: 1 });
        commands.spawn([position, velocity])({ [position]: 10, [velocity]: 5 });
    }
});
const move = System.create({ kernel: true, components: { with: [position], optional: [velocity] } }, row => {
    const speed = row[velocity];
    if (speed !== undefined) row[position] += speed;
});
const assign = System.create({ kernel: true, components: { with: [position], optional: [velocity] } }, row => {
    row[velocity] = row[position];
});
const totals = { moved: 0, still: 0 };
const sum = System.create({ readonly: true, components: { with: [position], optional: [velocity] } }, row => {
    if (row[velocity] === undefined) totals.still += row[position];
    else totals.moved += row[position];
});

const world = (wasm: boolean) => createWorld({ [workers]: 2 }, { minimumChunk: 2, wasm });

/** The positions of rows with a velocity and without, once the kernel moved them on workers. */
export const movedOnWorkers = async (wasm: boolean): Promise<{ readonly moved: number; readonly still: number }> => {
    await using moving = world(wasm);
    await moving.run(spawn);
    await moving.run(move);
    totals.moved = totals.still = 0;
    await moving.run(sum);
    return { ...totals };
};

/** What the run of a kernel assigning the optional component on workers failed with. */
export const assignedOnWorkers = async (wasm: boolean): Promise<readonly string[]> => {
    await using assigning = world(wasm);
    await assigning.run(spawn);
    return (await runReported(assigning, assign)).failures.map(failure => failure.message);
};
