// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock } from "../interface/resources/clock.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Kernels taking remainders: of a value the same for every row, from resources, and of a number column in every row,
// against the same kernel without them.

const level = Symbol("invariants/level");
const step = Symbol("invariants/step");
declare module "@adobe/ecs" {
    export interface Components {
        [level]: { type: number };
        [step]: { type: number };
    }
}

const rows = 10_000;

const seed = System.create({}, ({ commands }) => {
    for (let i = 0; i < rows; i++) commands.spawn([level, step])({ [level]: 0, [step]: i % 3 });
});

/** Raises each row by its step. */
const raise = System.create({ kernel: true, components: { with: [level, step] } }, row => {
    row[level] += row[step];
});
/** Raises each row by its step on even ticks: a remainder of a resource, the same for every row. */
const raiseOnEvenTicks = System.create({ kernel: true, components: { with: [level, step] } }, (row, { resources }) => {
    if (resources[clock].tick % 2 === 0) row[level] += row[step];
});

/** Wraps each row's level at 1,000 after its step: a remainder of a number column, an integer in every row. */
const wrap = System.create({ kernel: true, components: { with: [level, step] } }, row => {
    row[level] = (row[level] + row[step]) % 1000;
});

const run = async (system: System<void>): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    await world.run(seed);
    const best = await fastest(() => world.run(system));
    await world.dispose();
    return best;
};

const benchmark = (name: string, operation: string, system: System<void>): Benchmark => ({
    name,
    operation,
    per: "rows",
    n: rows,
    typical: [1_000, 100_000],
    best: { bytes: 24, basis: "Each row reads its 8-byte step and reads and writes its 8-byte level." },
    run: () => run(system),
});

export const invariantBenchmarks: readonly Benchmark[] = [
    benchmark("raise 10K", "A kernel adding one number column to another over 10K rows, as `raise on even ticks 10K` does on even ticks.", raise),
    benchmark("wrap 10K", "`raise 10K` wrapping each level at 1,000: a remainder of a number column by a literal in every row, an integer there.", wrap),
    benchmark("raise on even ticks 10K", "`raise 10K` under a test of the clock's tick `% 2`: a value of resources the same for every row, computed once a call.", raiseOnEvenTicks),
];
