// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../../interface/component/component.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";

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
declare module "@adobe/ecs" {
    export interface Threads {
        tailsTest: true;
    }
    export interface Components {
        [stamp]: { type: number };
        [spot]: { type: readonly [number, number, number] };
        [label]: { type: { readonly text: string } | null; thread: "tailsTest" };
        [word]: { type: string };
    }
    export interface Resources {
        [counter]: { type: number };
        [stall]: { type: { readonly mode: number; readonly pause: number } };
        [spawning]: { type: number };
        [failAt]: { type: number };
        [canvas]: { type: { readonly text: string }; thread: "tailsTest" };
    }
}
Component.register(stamp, { type: { type: "integer" } });
Component.register(spot, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
/** An object of the tail's thread, which the tail writes. */
const text = { type: "object", properties: { text: { type: "string" } } } as const;
Component.register(label, { type: { anyOf: [text, { type: "null" }], default: null }, thread: "tailsTest" });
/** A string the world writes each tick, which lives in shared memory where the tail reads it. */
Component.register(word, { type: { type: "string" } });
Resource.register(counter, { type: { type: "integer", default: 0 } });
/**
 * How the tails stall, for milliseconds `pause`: `"none"`, `"chunk"` in the watcher at the end of its first chunk, so
 * a writer is ready mid-way, or `"before"` in a tail ahead of it, so the watcher is late.
 */
Resource.register(stall, {
    type: { type: "object", properties: { mode: { type: "integer" }, pause: { type: "number" } }, required: ["mode", "pause"], default: { mode: 0, pause: 0 } },
});
Resource.register(spawning, { type: { type: "integer", default: 0 } });
Resource.register(failAt, { type: { type: "integer", default: -1 } });
/** An object resource of the tail's thread, which places the systems reading it there. */
Resource.register(canvas, { type: { ...text, default: { text: "canvas" } }, thread: "tailsTest" });

export const noStall = 0;
export const stallAtChunk = 1;
export const stallBefore = 2;

const spin = (milliseconds: number): void => {
    const until = performance.now() + milliseconds;
    while (performance.now() < until);
};

/** On the world's thread: the counter moves on once a tick. */
export const count = System.create({ name: "tailsTest/count", resources: { write: [counter] } }, ({ resources }) => {
    resources[counter] += 1;
});
/** A tick's word, of a length that varies with it, so records of every size are freed and reused. */
export const wordOf = (value: number): string => `${"·".repeat(value % 37)}${value}`;

/** On the world's thread: every row's stamp, spot and word take the counter. */
export const advance = System.create({ name: "tailsTest/advance", components: { write: [stamp, spot, word] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    row[spot] = [value, -value, value];
    row[word] = wordOf(value);
});
/** On the world's thread: every row's word as another, of the size of the first ticks', so their records are reused. */
export const reword = System.create({ name: "tailsTest/reword", components: { write: [word] } }, (row, _context, input: { readonly round: number }) => {
    row[word] = `r${input.round}`;
});
/** On the world's thread: spawns rows stamped with this tick's counter, `spawning` of them, then no more. */
export const grow = System.create({ name: "tailsTest/grow", resources: { read: [counter], write: [spawning] }, after: [count] }, ({ resources, commands }) => {
    const value = resources[counter];
    for (let k = 0; k < resources[spawning]; k++) commands.spawn([stamp, spot, label, word])({ [stamp]: value, [spot]: [value, -value, value], [word]: wordOf(value) });
    resources[spawning] = 0;
});
/** Spawns `count` rows. */
export const seed = System.create({ name: "tailsTest/seed" }, ({ commands }, input: { readonly count: number }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([stamp, spot, label, word])({ [stamp]: 0, [spot]: [0, 0, 0], [word]: wordOf(0) });
});
export const setStall = System.create({ name: "tailsTest/setStall", resources: { write: [stall] } }, ({ resources }, input: { readonly mode: number; readonly pause: number }) => {
    resources[stall] = { mode: input.mode, pause: input.pause };
});
export const setSpawning = System.create({ name: "tailsTest/setSpawning", resources: { write: [spawning] } }, ({ resources }, input: { readonly count: number }) => {
    resources[spawning] = input.count;
});
export const setFailAt = System.create({ name: "tailsTest/setFailAt", resources: { write: [failAt] } }, ({ resources }, input: { readonly at: number }) => {
    resources[failAt] = input.at;
});

/** What each run of the watcher saw, by the counter it read: rows, and those whose structs, word or label weren't that tick's. */
export type Seen = { counter: number; rows: number; wrong: number; labels: number };
export const seen: Seen[] = [];

/** On the tail's thread, ahead of the watcher: stalls it while `stall` says so, so it's late. */
export const lead = System.create({ name: "tailsTest/lead", resources: { read: [stall, canvas] } }, ({ resources }) => {
    if (resources[stall].mode === stallBefore && resources[canvas].text === "canvas") spin(resources[stall].pause);
});

/**
 * A tail on thread "tailsTest": reads every row's structs, which must all be of one tick, and writes its label, which
 * must be the last tick's where it wrote one.
 */
export const watch = System.create({
    name: "tailsTest/watch", components: { read: [stamp, spot, word], write: [label] }, resources: { read: [counter, stall, failAt] }, after: [advance, grow, lead],
}, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value) seen.push(last = { counter: value, rows: 0, wrong: 0, labels: 0 });
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
export const blocking = System.create({ name: "tailsTest/blocking", components: { read: [label] } }, (row, { commands }) => {
    if (row[label]?.text === "never") commands.despawn(row.entity);
});

/** By counter, rows whose label changed since `tally` last ran. */
export const changed = new Map<number, number>();
/**
 * On the tail's thread, ahead of the watcher, reaching its commands, so its tier blocks: counts the labels the watcher
 * wrote since it last ran, which it sees once the world stamped them, from the watcher's snapshot too.
 */
export const tally = System.create({ name: "tailsTest/tally", components: { read: [label], changed: [label] }, resources: { read: [counter] }, after: [count], before: [watch] }, (row, { resources, commands }) => {
    if (row[label]?.text === "never") commands.despawn(row.entity);
    changed.set(resources[counter], (changed.get(resources[counter]) ?? 0) + 1);
});

/** The words a held tail and the world share, once the world gives them: the gate opens at [0], the tail is held at [1]. */
export const gate: { words: Int32Array | null } = { words: null };

/** On the tail's thread, terminal, reading only that thread's objects: held in its body until the world opens the gate. */
export const held = System.create({ name: "tailsTest/held", resources: { read: [canvas] } }, ({ resources }) => {
    const { words } = gate;
    if (words === null || resources[canvas].text !== "canvas") return;
    Atomics.store(words, 1, 1);
    Atomics.notify(words, 1);
    Atomics.wait(words, 0, 0);
});
export const heldTick = System.create({ name: "tailsTest/heldTick", systems: [held] });

/** Every tick: the world's systems, then the tails. */
export const ticked = System.create({ name: "tailsTest/ticked", systems: [count, advance, grow, lead, watch] });
/** The same, with `tally` counting what the watcher wrote. */
export const tallied = System.create({ name: "tailsTest/tallied", systems: [count, advance, grow, lead, tally, watch] });

/** Every system the joined thread runs, which it imports so the world can place them there. */
export const tailSystems: readonly System<void>[] = [ticked, tallied, blocking, heldTick];
