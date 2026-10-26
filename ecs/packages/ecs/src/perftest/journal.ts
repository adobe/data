// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { forest, local, propagateChanged } from "./hierarchy.js";

// Frames of a filtered `up` over 4K rows while a few hundred of them move archetype each frame: the journal of what
// sync points changed fills every few frames, and what it keeps decides whether the tree patches or builds again.

const flag = Symbol("journal/flag");
declare module "@adobe/ecs" {
    export interface Components {
        [flag]: { type: true };
    }
}

const moved = 250;
const frames = 64;

/** Flags `moved` rows, or unflags them, from `start` on in storage order. */
const toggle = System.create({ kernel: false, components: { with: [local] } }, (row, { commands }, input: { readonly start: number; readonly on: boolean }) => {
    const at = row.entity % 4_096;
    if (at < input.start || at >= input.start + moved) return;
    if (input.on) commands.add(row.entity, flag, true);
    else commands.remove(row.entity, flag);
});

export const journalBenchmarks: readonly Benchmark[] = [{
    name: "up filtered 4K, 250 moving a frame",
    operation: "Frames of a filtered `up` over 1K chains of 4 while 250 rows move archetype each frame, timed over 64 frames: the journal fills every few frames.",
    per: "frames",
    n: frames,
    typical: [1, 1],
    best: { bytes: moved * 64, basis: "Each moved row and its child read and write about 64 bytes of tree, order and values." },
    run: async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(forest, { roots: 1_000, depth: 4 });
        await world.run(propagateChanged);
        let frame = 0;
        const stretch = async (): Promise<number> => {
            const start = performance.now();
            for (let k = 0; k < frames; k++, frame++) {
                await world.run(toggle, { start: (frame >> 1) % 16 * moved, on: frame % 2 === 0 });
                await world.run(propagateChanged);
            }
            return performance.now() - start;
        };
        for (let k = 0; k < 4; k++) await stretch();
        let best = Infinity;
        for (let k = 0; k < 16; k++) best = Math.min(best, await stretch());
        await world.dispose();
        return best;
    },
}];
