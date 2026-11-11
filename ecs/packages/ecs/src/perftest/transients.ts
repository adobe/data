// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// A frame ending with a system that despawns the frame's one-frame events, of which there are none: one
// `despawnWhere` each frame, against a row system despawning each row, which issues nothing.

const frameTransient = Symbol("transients/frameTransient");
const level = Symbol("transients/level");
const kind = Symbol("transients/kind");
declare module "@adobe/ecs" {
    export interface Components {
        [frameTransient]: { type: true };
        [level]: { type: number };
        [kind]: { type: number };
    }
}

/** Entities the world holds, none of them events. */
const entities = 10_000;
/** Frames in each timed sample. */
const frames = 100;

let read = 0;

const seed = System.create({}, ({ commands }) => {
    for (let k = 0; k < entities; k++) {
        if (k % 100 !== 0) commands.spawn([level])({ [level]: k });
        else commands.spawn([level, kind])({ [level]: k, [kind]: k });
    }
    // Events once raised, so their archetypes are made and empty again.
    commands.spawn([frameTransient])();
    commands.spawn([frameTransient, kind])({ [kind]: 0 });
});

const clearEvents = System.create({}, ({ commands }) => { commands.despawnWhere({ with: [frameTransient] }); });

/** The frame's work: a system reading a value of each of 100 rows. */
const input = System.create({ components: { with: [kind] } }, row => { read += row[kind]; });

const batched = System.create([input, System.create({ after: [input] }, ({ commands }) => { commands.despawnWhere({ with: [frameTransient] }); })]);
const perRow = System.create([input, System.create({ after: [input], components: { with: [frameTransient] } }, (row, { commands }) => { commands.despawn(row.entity); })]);

const runBest = { bytes: 64, basis: "A run reads at least one cache line of its system's state." };

const timed = (frame: System) => async (): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    try {
        await world.run(seed);
        await world.run(clearEvents);
        return await fastest(async () => { for (let k = 0; k < frames; k++) await world.run(frame); }) / frames;
    }
    finally {
        await world.dispose();
    }
};

export const transientBenchmarks: readonly Benchmark[] = [
    {
        name: "end frame despawnWhere none",
        operation: "A frame reading 100 of 10K rows ending with a system that despawns its one-frame events by one `despawnWhere`, matching none: the cost of a batch despawn with nothing to despawn, against `end frame despawn rows none`.",
        per: "frames",
        n: 1,
        typical: [1, 1],
        best: runBest,
        run: timed(batched),
    },
    {
        name: "end frame despawn rows none",
        operation: "A frame reading 100 of 10K rows ending with a row system despawning each one-frame event, of which there are none, so it issues nothing.",
        per: "frames",
        n: 1,
        typical: [1, 1],
        best: runBest,
        run: timed(perRow),
    },
];
