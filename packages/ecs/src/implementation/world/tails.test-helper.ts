// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import type { Schema } from "../../interface/schema/schema.js";
import type { Vec3 } from "../../interface/math/index.js";

// Keys and systems both threads of the tails fixtures import: a world system writing every row's stamp each tick, and
// terminal systems on thread "tailsTest", which a joined thread fills, running there as tails.

export const stamp = Symbol("tailsTest/stamp");
export const spot = Symbol("tailsTest/spot");
export const label = Symbol("tailsTest/label");
export const counter = Symbol("tailsTest/counter");
export const stall = Symbol("tailsTest/stall");
export const spawning = Symbol("tailsTest/spawning");
export const failAt = Symbol("tailsTest/failAt");
export const canvas = Symbol("tailsTest/canvas");
export const word = Symbol("tailsTest/word");
/** On every other row: rows without it are in an archetype of their own, so a tail's optional read of it tells them apart. */
export const extra = Symbol("tailsTest/extra");
declare module "@adobe/ecs" {
    export interface Threads {
        tailsTest: true;
    }
    export interface Components {
        [stamp]: { type: Schema.Type<{ type: "integer" }> };
        [spot]: { type: Vec3 };
        [label]: { type: { readonly text: string } | null; thread: "tailsTest"; default: null };
        [word]: { type: string };
        [extra]: { type: Schema.Type<{ type: "integer" }> };
    }
    export interface Resources {
        [counter]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
        [stall]: { type: Schema.Type<{ type: "object"; properties: { mode: { type: "integer" }; pause: { type: "number" } } }>; default: { mode: 0; pause: 0 } };
        [spawning]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
        [failAt]: { type: Schema.Type<{ type: "integer" }>; default: -1 };
        [canvas]: { type: { readonly text: string }; thread: "tailsTest"; default: { text: "canvas" } };
    }
}
/** An object of the tail's thread, which the tail writes. */
const text = { type: "object", properties: { text: { type: "string" } } } as const;
/** A string the world writes each tick, which lives in shared memory where the tail reads it. */
/**
 * How the tails stall, for milliseconds `pause`: `"none"`, `"chunk"` in the watcher at the end of its first chunk, so
 * a writer is ready mid-way, or `"before"` in a tail ahead of it, so the watcher is late.
 */
/** An object resource of the tail's thread, which places the systems reading it there. */

export const noStall = 0;
export const stallAtChunk = 1;
export const stallBefore = 2;

const spin = (milliseconds: number): void => {
    const until = performance.now() + milliseconds;
    while (performance.now() < until);
};

/** On the world's thread: the counter moves on once a tick. */
export const count = System.create({}, ({ resources }) => {
    resources[counter] += 1;
});
/** A tick's word, of a length that varies with it, so records of every size are freed and reused. */
export const wordOf = (value: number): string => `${"·".repeat(value % 37)}${value}`;

/** On the world's thread: every row's stamp, spot and word take the counter. */
export const advance = System.create({ components: { with: [stamp, spot, word], optional: [extra] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    if (row[extra] !== undefined) row[extra] = value;
    row[spot] = [value, -value, value];
    row[word] = wordOf(value);
});
/** On the world's thread: every row's word as another, of the size of the first ticks', so their records are reused. */
export const reword = System.create({ components: { with: [word] } }, (row, _context, input: { readonly round: number }) => {
    row[word] = `r${input.round}`;
});
/** On the world's thread: spawns rows stamped with this tick's counter, `spawning` of them, then no more. */
export const grow = System.create({ after: [count] }, ({ resources, commands }) => {
    const value = resources[counter];
    for (let k = 0; k < resources[spawning]; k++) {
        if (k % 2 === 0) commands.spawn([stamp, spot, label, word, extra])({ [stamp]: value, [spot]: [value, -value, value], [word]: wordOf(value), [extra]: value });
        else commands.spawn([stamp, spot, label, word])({ [stamp]: value, [spot]: [value, -value, value], [word]: wordOf(value) });
    }
    resources[spawning] = 0;
});
/** Spawns `count` rows. */
export const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let k = 0; k < input.count; k++) {
        if (k % 2 === 0) commands.spawn([stamp, spot, label, word, extra])({ [stamp]: 0, [spot]: [0, 0, 0], [word]: wordOf(0), [extra]: 0 });
        else commands.spawn([stamp, spot, label, word])({ [stamp]: 0, [spot]: [0, 0, 0], [word]: wordOf(0) });
    }
});
export const setStall = System.create({}, ({ resources }, input: { readonly mode: number; readonly pause: number }) => {
    resources[stall] = { mode: input.mode, pause: input.pause };
});
export const setSpawning = System.create({}, ({ resources }, input: { readonly count: number }) => {
    resources[spawning] = input.count;
});
export const setFailAt = System.create({}, ({ resources }, input: { readonly at: number }) => {
    resources[failAt] = input.at;
});

/** What each run of the watcher saw, by the counter it read: rows, and those whose structs, word or label weren't that tick's. */
export type Seen = { counter: number; rows: number; wrong: number; labels: number; lacking: number };
export const seen: Seen[] = [];

/** On the tail's thread, ahead of the watcher: stalls it while `stall` says so, so it's late. */
export const lead = System.create({}, ({ resources }) => {
    if (resources[stall].mode === stallBefore && resources[canvas].text === "canvas") spin(resources[stall].pause);
});

/**
 * A tail on thread "tailsTest": reads every row's structs, which must all be of one tick, and writes its label, which
 * must be the last tick's where it wrote one.
 */
export const watch = System.create({
    components: { with: [stamp, spot, word, label], optional: [extra] }, after: [advance, grow, lead],
}, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value) seen.push(last = { counter: value, rows: 0, wrong: 0, labels: 0, lacking: 0 });
    const more = row[extra];
    if (more === undefined) last.lacking++;
    else if (more !== value) last.wrong++;
    if (resources[failAt] === value) throw new Error(`tailsTest failure at ${value}`);
    const [x, y, z] = row[spot];
    if (row[stamp] !== value || x !== value || y !== -value || z !== value || row[word] !== wordOf(value)) last.wrong++;
    const previous = row[label]?.text ?? null;
    if (previous !== null && previous !== String(value - 1) && previous !== String(value)) last.labels++;
    row[label] = { text: String(value) };
    last.rows++;
    if (last.rows === 63 && resources[stall].mode === stallAtChunk) spin(resources[stall].pause);
});

/** Not terminal: it reaches its commands, so its tier blocks. */
export const blocking = System.create({ components: { with: [label] } }, (row, { commands }) => {
    if (row[label]?.text === "never") commands.despawn(row.entity);
});

/** By counter, rows whose label changed since `tally` last ran. */
export const changed = new Map<number, number>();
/**
 * On the tail's thread, ahead of the watcher, reaching its commands, so its tier blocks: counts the labels the watcher
 * wrote since it last ran, which it sees once the world stamped them, from the watcher's snapshot too.
 */
export const tally = System.create({ components: { with: [label], changed: [label] }, after: [count], before: [watch] }, (row, { resources, commands }) => {
    if (row[label]?.text === "never") commands.despawn(row.entity);
    changed.set(resources[counter], (changed.get(resources[counter]) ?? 0) + 1);
});

/** The words a held tail and the world share, once the world gives them: the gate opens at [0], the tail is held at [1]. */
export const gate: { words: Int32Array | null } = { words: null };

/** On the tail's thread, terminal, reading only that thread's objects: held in its body until the world opens the gate. */
export const held = System.create({}, ({ resources }) => {
    const { words } = gate;
    if (words === null || resources[canvas].text !== "canvas") return;
    Atomics.store(words, 1, 1);
    Atomics.notify(words, 1);
    Atomics.wait(words, 0, 0);
});
export const heldTick = System.create({ systems: [held] });

/** Every tick: the world's systems, then the tails. */
export const ticked = System.create({ systems: [count, advance, grow, lead, watch] });
/** The same, with `tally` counting what the watcher wrote. */
export const tallied = System.create({ systems: [count, advance, grow, lead, tally, watch] });

/** Every system the joined thread runs, which it imports so the world can place them there. */
export const tailSystems: readonly System<void>[] = [ticked, tallied, blocking, heldTick];
