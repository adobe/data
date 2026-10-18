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
declare module "@adobe/data-ecs" {
    export interface Threads {
        tailsTest: true;
    }
    export interface Components {
        [stamp]: { type: number };
        [spot]: { type: readonly [number, number, number] };
        [label]: { type: string | null; thread: "tailsTest" };
    }
    export interface Resources {
        [counter]: { type: number };
        [stall]: { type: { readonly mode: number; readonly pause: number } };
        [spawning]: { type: number };
        [failAt]: { type: number };
        [canvas]: { type: string; thread: "tailsTest" };
    }
}
Component.register(stamp, { type: { type: "integer" } });
Component.register(spot, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
/** An object of the tail's thread, which the tail writes. */
Component.register(label, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: null }, thread: "tailsTest" });
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
Resource.register(canvas, { type: { type: "string", default: "canvas" }, thread: "tailsTest" });

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
/** On the world's thread: every row's stamp and spot take the counter. */
export const advance = System.create({ name: "tailsTest/advance", components: { write: [stamp, spot] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    row[spot] = [value, -value, value];
});
/** On the world's thread: spawns rows stamped with this tick's counter, `spawning` of them, then no more. */
export const grow = System.create({ name: "tailsTest/grow", resources: { read: [counter], write: [spawning] }, after: [count] }, ({ resources, commands }) => {
    const value = resources[counter];
    for (let k = 0; k < resources[spawning]; k++) commands.spawn([stamp, spot, label])({ [stamp]: value, [spot]: [value, -value, value] });
    resources[spawning] = 0;
});
/** Spawns `count` rows. */
export const seed = System.create({ name: "tailsTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([stamp, spot, label])({ [stamp]: 0, [spot]: [0, 0, 0] });
});
export const setStall = System.create({ name: "tailsTest/setStall", input: { type: "object", properties: { mode: { type: "integer" }, pause: { type: "number" } } }, resources: { write: [stall] } }, ({ input, resources }) => {
    resources[stall] = { mode: input.mode, pause: input.pause };
});
export const setSpawning = System.create({ name: "tailsTest/setSpawning", input: { type: "object", properties: { count: { type: "integer" } } }, resources: { write: [spawning] } }, ({ input, resources }) => {
    resources[spawning] = input.count;
});
export const setFailAt = System.create({ name: "tailsTest/setFailAt", input: { type: "object", properties: { at: { type: "integer" } } }, resources: { write: [failAt] } }, ({ input, resources }) => {
    resources[failAt] = input.at;
});

/** What each run of the watcher saw, by the counter it read: rows, and those whose structs or label weren't that tick's. */
export type Seen = { counter: number; rows: number; wrong: number; labels: number };
export const seen: Seen[] = [];

/** On the tail's thread, ahead of the watcher: stalls it while `stall` says so, so it's late. */
export const lead = System.create({ name: "tailsTest/lead", resources: { read: [stall, canvas] } }, ({ resources }) => {
    if (resources[stall].mode === stallBefore && resources[canvas] === "canvas") spin(resources[stall].pause);
});

/**
 * A tail on thread "tailsTest": reads every row's structs, which must all be of one tick, and writes its label, which
 * must be the last tick's where it wrote one.
 */
export const watch = System.create({
    name: "tailsTest/watch", components: { read: [stamp, spot], write: [label] }, resources: { read: [counter, stall, failAt] }, after: [advance, grow, lead],
}, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value) seen.push(last = { counter: value, rows: 0, wrong: 0, labels: 0 });
    if (resources[failAt] === value) throw new Error(`tailsTest failure at ${value}`);
    const [x, y, z] = row[spot];
    if (row[stamp] !== value || x !== value || y !== -value || z !== value) last.wrong++;
    const previous = row[label];
    if (previous !== null && previous !== String(value - 1) && previous !== String(value)) last.labels++;
    row[label] = String(value);
    last.rows++;
    if (last.rows === 63 && resources[stall].mode === stallAtChunk) spin(resources[stall].pause);
});

/** Not terminal: it reaches its commands, so its tier blocks. */
export const blocking = System.create({ name: "tailsTest/blocking", components: { read: [label] } }, (row, { commands }) => {
    if (row[label] === "never") commands.despawn(row.entity);
});

/** By counter, rows whose label changed since `tally` last ran. */
export const changed = new Map<number, number>();
/**
 * On the tail's thread, ahead of the watcher, reaching its commands, so its tier blocks: counts the labels the watcher
 * wrote since it last ran, which it sees once the world stamped them, from the watcher's snapshot too.
 */
export const tally = System.create({ name: "tailsTest/tally", components: { read: [label], changed: [label] }, resources: { read: [counter] }, after: [count], before: [watch] }, (row, { resources, commands }) => {
    if (row[label] === "never") commands.despawn(row.entity);
    changed.set(resources[counter], (changed.get(resources[counter]) ?? 0) + 1);
});

/** Every tick: the world's systems, then the tails. */
export const ticked = System.create({ name: "tailsTest/ticked", systems: [count, advance, grow, lead, watch] });
/** The same, with `tally` counting what the watcher wrote. */
export const tallied = System.create({ name: "tailsTest/tallied", systems: [count, advance, grow, lead, tally, watch] });

/** Every system the joined thread runs, which it imports so the world can place them there. */
export const tailSystems: readonly System<void>[] = [ticked, tallied, blocking];
