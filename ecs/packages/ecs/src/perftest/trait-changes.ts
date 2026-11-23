// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// A readonly system filtering on a trait's changes, over 100K entities in 10 archetypes holding a component declaring
// the trait: what it costs a run that changes nothing the trait covers, and one that writes a row of it.

const saved = Symbol("traitChanges/saved");
const size = Symbol("traitChanges/size");
const kind = Symbol("traitChanges/kind");
const other = Symbol("traitChanges/other");
declare module "@adobe/ecs" {
    export interface Traits<N> {
        readonly [saved]: N extends unknown ? true : never;
    }
    export interface Components {
        [size]: { type: number; [saved]: true };
        [kind]: { type: number; shared: true };
        [other]: { type: number };
    }
}

const entities = 100_000;
const archetypes = 10;
/** Runs in each timed sample. */
const runs = 100;

const spawnAll = System.create(({ commands }) => {
    for (let a = 0; a < archetypes; a++) {
        const spawn = commands.spawn([size, kind, other], { [kind]: a });
        for (let k = 0; k < entities / archetypes; k++) spawn({ [size]: k, [other]: k });
    }
});
let noticed = 0;
const notice = System.create({ readonly: true, changed: [saved] }, () => { noticed++; });
const touchOther = System.create({}, () => {});
let row = 0;
const writeOne = System.create({ components: { with: [size] } }, entry => {
    if (row++ === 0) entry[size] = entry[size] + 1;
});

const timed = (system: System, expected: number) => async (): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    try {
        await world.run(spawnAll);
        world.add(notice);
        await world.run(touchOther);
        return await fastest(async () => {
            noticed = 0;
            for (let k = 0; k < runs; k++) {
                row = 0;
                await world.run(system);
            }
            if (noticed !== expected) throw new Error(`trait changes: noticed ${noticed} of ${runs} runs, not ${expected}`);
        });
    }
    finally {
        await world.dispose();
    }
};

const runBest = { bytes: 64, basis: "A run reads at least one cache line of its system's state." };

export const traitChangesBenchmarks: readonly Benchmark[] = [
    {
        name: "trait notice quiet 100K",
        operation: "A run changing nothing, with a readonly system filtering on a trait 100K entities in 10 archetypes hold: the filter's check of their stamps and counts.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(touchOther, 0),
    },
    {
        name: "trait notice written 100K",
        operation: "A run writing one row of a component declaring the trait, which the readonly system filtering on it notices.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(writeOne, runs),
    },
];
