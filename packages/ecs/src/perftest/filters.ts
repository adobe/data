// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import { Component } from "../interface/component/component.js";
import type { I32 } from "../interface/math/i32/index.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import { retainedRuns } from "../implementation/world/reports.js";
import type { Benchmark } from "./benchmark.js";

// Change filters over one archetype of 100K rows after a writer changed one row, a few, or every one: what finding the
// rows that pass costs each system that filters, apart from running them.

const value = Symbol("filters/value");
const other = Symbol("filters/other");
const at = Symbol("filters/at");
const out0 = Symbol("filters/out0");
const out1 = Symbol("filters/out1");
const out2 = Symbol("filters/out2");
const out3 = Symbol("filters/out3");
declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
        [at]: { type: number };
        [out0]: { type: number };
        [out1]: { type: number };
        [out2]: { type: number };
        [out3]: { type: number };
    }
}
Component.register(value, { type: { type: "number" } });
Component.register(other, { type: { type: "number" } });
Component.register(at, { type: { type: "integer", minimum: 0, maximum: 0x7FFFFFFF } });
Component.register(out0, { type: { type: "number" } });
Component.register(out1, { type: { type: "number" } });
Component.register(out2, { type: { type: "number" } });
Component.register(out3, { type: { type: "number" } });

const rows = 100_000;
const filtered = Archetype.create([value, other, at, out0, out1, out2, out3]);

const seed = System.create({ name: "filters/seed" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn(filtered)({ [value]: 0, [other]: 0, [at]: i, [out0]: 0, [out1]: 0, [out2]: 0, [out3]: 0 });
});

/** Writes the value of the rows whose `at` is `first` plus a multiple of `stride`. */
const write = System.create({
    name: "filters/write",
    kernel: "cpu",
    components: { read: [at], write: [value] },
}, (row, _context, input: { readonly first: I32; readonly stride: I32 }) => {
    const offset = row[at] - input.first;
    if (offset >= 0 && offset % input.stride === 0) row[value] += 1;
});

let seen = 0;
/** Main-thread systems each filtering on `value`'s changes. */
const readers = System.create({
    name: "filters/readers",
    systems: Array.from({ length: 8 }, (_, i) => System.create({ name: `filters/reader${i}`, components: { read: [value], changed: [value] } }, row => {
        seen += row[value];
    })),
});
/** The same filtering on `value`'s or `other`'s changes, of which only `value` is written. */
const readersOfTwo = System.create({
    name: "filters/readersOfTwo",
    systems: Array.from({ length: 8 }, (_, i) => System.create({ name: `filters/readerOfTwo${i}`, components: { read: [value], changed: [value, other] } }, row => {
        seen += row[value];
    })),
});
/** Kernels each filtering on `value`'s changes, writing an output of its own. */
const kernels = System.create({
    name: "filters/kernels",
    systems: [
        System.create({ name: "filters/kernel0", kernel: "cpu", components: { read: [value], write: [out0], changed: [value] } }, row => { row[out0] = row[value] * 2; }),
        System.create({ name: "filters/kernel1", kernel: "cpu", components: { read: [value], write: [out1], changed: [value] } }, row => { row[out1] = row[value] * 3; }),
        System.create({ name: "filters/kernel2", kernel: "cpu", components: { read: [value], write: [out2], changed: [value] } }, row => { row[out2] = row[value] * 4; }),
        System.create({ name: "filters/kernel3", kernel: "cpu", components: { read: [value], write: [out3], changed: [value] } }, row => { row[out3] = row[value] * 5; }),
    ],
});

/** The fastest run of `measured` right after a write of every `stride`th row from a moving first row. */
const afterWrites = async (measured: System, stride: number): Promise<number> => {
    const world: World = createWorld({ [workers]: 0 });
    await world.run(seed, { count: rows });
    await world.run(measured);
    let best = Infinity;
    const warm = Math.max(20, Math.ceil(retainedRuns / 2));
    for (let i = 0; i < warm + 200; i++) {
        await world.run(write, { first: (i * 7919) % Math.min(stride, rows), stride });
        const start = performance.now();
        await world.run(measured);
        if (i >= warm) best = Math.min(best, performance.now() - start);
    }
    await world.dispose();
    return best;
};

const cases = [
    { name: "one", stride: rows * 2, said: "one row changed" },
    { name: "few", stride: 10_000, said: "ten rows changed, 10,000 apart" },
    { name: "all", stride: 1, said: "every row changed" },
] as const;

export const filterBenchmarks: readonly Benchmark[] = [
    ...cases.map(({ name, stride, said }): Benchmark => ({
        name: `changed ${name} 100K`,
        operation: `Eight main-thread systems filtering on \`changed\` over 100K rows after ${said}: views and derived values reacting to edits.`,
        per: "systems",
        n: 8,
        typical: [1, 100],
        best: { bytes: 0, basis: "Finding the changed rows could cost nothing beyond running them." },
        run: () => afterWrites(readers, stride),
    })),
    {
        name: "changed one 100K two filters",
        operation: "Eight main-thread systems filtering on `changed` of two components over 100K rows after one row's first component changed.",
        per: "systems",
        n: 8,
        typical: [1, 100],
        best: { bytes: 0, basis: "Finding the changed row could cost nothing beyond running it." },
        run: () => afterWrites(readersOfTwo, rows * 2),
    },
    ...cases.map(({ name, stride, said }): Benchmark => ({
        name: `changed ${name} 100K kernels`,
        operation: `Four kernels filtering on \`changed\` over 100K rows after ${said}, on the world's thread: derived columns kept current.`,
        per: "systems",
        n: 4,
        typical: [1, 100],
        best: { bytes: 0, basis: "Finding the changed rows could cost nothing beyond running them." },
        run: () => afterWrites(kernels, stride),
    })),
];

export const seenTotal = (): number => seen;
