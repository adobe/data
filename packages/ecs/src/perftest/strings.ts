// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld, join } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Benchmarks of strings, which the world's thread holds as values, and keeps records of in shared memory while a joined
// thread may read them, against the same text held as objects, as every string was before.

const text = Symbol("strings/text");
const boxed = Symbol("strings/boxed");
declare module "@adobe/ecs" {
    export interface Components {
        [text]: { type: string };
        [boxed]: { type: { readonly text: string } };
    }
}

const rows = 10_000;

/** A todo's label, of a typical length, different per row and round. */
const labelOf = (row: number, round: number): string => `Buy milk and bread #${row}.${round}`;

const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([text, boxed])({ [text]: labelOf(i, 0), [boxed]: { text: labelOf(i, 0) } });
});

let total = 0;
let round = 0;

const readText = System.create({ components: { read: [text] } }, row => { total += row[text].length; });
const readBoxed = System.create({ components: { read: [boxed] } }, row => { total += row[boxed].text.length; });
const writeText = System.create({ components: { write: [text] } }, row => { row[text] = labelOf(row.entity, round); });
const writeBoxed = System.create({ components: { write: [boxed] } }, row => { row[boxed] = { text: labelOf(row.entity, round) }; });

/** A seeded world, with a joined thread on this one when `shared`, which keeps records of its strings. */
const seeded = async (shared = false): Promise<{ readonly world: World; readonly dispose: () => Promise<void> }> => {
    const world = createWorld({ [workers]: 0 });
    const channel = new MessageChannel();
    if (shared) world.share(channel.port1);
    const remote = shared ? join(channel.port2, { threads: [] }) : null;
    await world.run(seed, { count: rows });
    return {
        world,
        dispose: async () => {
            await remote?.dispose();
            await world.dispose();
        },
    };
};

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

/** The fastest run of `system` over the seeded rows, each run a new round of text, with a joined thread when `shared`. */
const measure = async (system: System, expected: (world: World) => Promise<void>, shared = false): Promise<number> => {
    const { world, dispose } = await seeded(shared);
    const best = await fastest(() => {
        round++;
        return world.run(system);
    });
    await expected(world);
    await dispose();
    return best;
};

const read = (system: System, name: string) => measure(system, async world => {
    total = 0;
    await world.run(system);
    check(total > rows * 20, `${name}: wrong lengths`);
});

/** Each row's text, as the last write left it. */
const written = (name: string) => async (world: World): Promise<void> => {
    let wrong = 0;
    await world.run(System.create({ observer: true, components: { read: [text, boxed] } }, row => {
        if (row[text] !== row[boxed].text && row[text] !== labelOf(row.entity, round) && row[boxed].text !== labelOf(row.entity, round)) wrong++;
    }));
    check(wrong === 0, `${name}: wrong text`);
};

export const stringBenchmarks: readonly Benchmark[] = [
    {
        name: "string read 10K",
        operation: "A main-thread system reading a string of every row, as a binding writing labels to the DOM does: the value the world's thread holds.",
        per: "rows",
        n: rows,
        typical: [100, 100_000],
        best: { bytes: 8, basis: "A row's reference to its string, in a JS array." },
        run: () => read(readText, "string read 10K"),
    },
    {
        name: "object read 10K",
        operation: "The same text held as an object of the world's thread, read the same way, as strings were held before they lived in shared memory.",
        per: "rows",
        n: rows,
        typical: [100, 100_000],
        best: { bytes: 8, basis: "A row's reference to its object, in a JS array." },
        run: () => read(readBoxed, "object read 10K"),
    },
    {
        name: "string write 10K",
        operation: "A main-thread system writing a new string to every row, as editing text does, with no joined thread: the world's thread holds its value, and keeps no record.",
        per: "rows",
        n: rows,
        typical: [1, 10_000],
        best: { bytes: 8, basis: "A row's reference to its string, in a JS array." },
        run: () => measure(writeText, written("string write 10K")),
    },
    {
        name: "string write 10K joined",
        operation: "The same writes while a joined thread may read strings, so each writes a new record of its text in shared memory and lets the old one go, freed two sync points on.",
        per: "rows",
        n: rows,
        typical: [1, 10_000],
        best: { bytes: 76, basis: "A record's 8-byte header and its 30 code units, and the row's 4-byte handle." },
        run: () => measure(writeText, written("string write 10K joined"), true),
    },
    {
        name: "object write 10K",
        operation: "The same text written as a new object of the world's thread to every row, as strings were held before.",
        per: "rows",
        n: rows,
        typical: [1, 10_000],
        best: { bytes: 8, basis: "A row's reference to its new object, in a JS array." },
        run: () => measure(writeBoxed, written("object write 10K")),
    },
];
