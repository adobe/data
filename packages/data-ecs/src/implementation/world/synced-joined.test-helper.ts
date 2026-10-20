import { Component } from "../../interface/component/component.js";
import { Index } from "../../interface/indexes/index-type.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import type { Entity } from "../../interface/entity/entity.js";

// Keys and systems both threads of the synced-joined fixtures import: world systems writing every row's stamp each
// tick, and synced systems a joined thread adds, reading those rows as of one sync point.

export const stamp = Symbol("syncedJoinedWorkerTest/stamp");
export const spot = Symbol("syncedJoinedWorkerTest/spot");
export const counter = Symbol("syncedJoinedWorkerTest/counter");
export const stall = Symbol("syncedJoinedWorkerTest/stall");
export const heat = Symbol("syncedJoinedWorkerTest/heat");
export const rate = Symbol("syncedJoinedWorkerTest/rate");
export const phase = Symbol("syncedJoinedWorkerTest/phase");
declare module "@adobe/data-ecs" {
    export interface Components {
        [stamp]: { type: number };
        [spot]: { type: readonly [number, number, number] };
        [heat]: { type: number };
        [rate]: { type: number };
    }
    export interface Resources {
        [counter]: { type: number };
        [stall]: { type: number };
        [phase]: { type: number };
    }
}
Component.register(stamp, { type: { type: "integer" } });
Component.register(spot, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
Component.register(heat, { type: { type: "number", precision: 1 } });
Component.register(rate, { type: { type: "number", precision: 1 } });
Resource.register(counter, { type: { type: "integer", default: 0 } });
/** Moves on once a joined thread asked the world to run its synced system, so the world's thread knows it did. */
Resource.register(phase, { type: { type: "integer", default: 0 } });
/**
 * Milliseconds the synced systems spin partway through each run, so the world's next writer is likely ready before they
 * finish; negative, they wait there on the gate instead, until the world's thread releases them once a writer copied.
 */
Resource.register(stall, { type: { type: "number", default: 0 } });

const spin = (milliseconds: number): void => {
    const until = performance.now() + milliseconds;
    while (performance.now() < until);
};

/**
 * Shared words the world's thread and the joined thread order their steps by: the counter a run waits partway at, the
 * counter the world's thread released runs through, and, once nonzero, the release of a thread holding its event loop.
 */
export const reachedWord = 0;
export const releasedWord = 1;
export const holdWord = 2;
export const gateWords = 3;
/** The joined thread's view of the gate, once the world's thread sent it. */
export const gate: { words: Int32Array | null } = { words: null };

/** Spins for `pause` milliseconds, or, negative, says it reached `value` and waits until it's released. */
const pauseAt = (pause: number, value: number): void => {
    const { words } = gate;
    if (pause >= 0 || words === null) {
        spin(pause);
        return;
    }
    Atomics.store(words, reachedWord, value);
    for (let released = Atomics.load(words, releasedWord); released < value; released = Atomics.load(words, releasedWord)) Atomics.wait(words, releasedWord, released);
};

/** Holds the joined thread's event loop until the world's thread releases it. */
export const hold = (): void => {
    const { words } = gate;
    if (words === null) return;
    while (Atomics.load(words, holdWord) === 0) Atomics.wait(words, holdWord, 0);
};

/** On the world's thread: the counter moves on once a tick, then every row's stamp and spot take it. */
export const count = System.create({ name: "syncedJoinedWorkerTest/count", resources: { write: [counter] } }, ({ resources }) => {
    resources[counter] += 1;
});
export const advance = System.create({ name: "syncedJoinedWorkerTest/advance", components: { write: [stamp, spot] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    row[spot] = [value, -value, value];
});
export const ticked = System.create({ name: "syncedJoinedWorkerTest/ticked", systems: [count, advance] });
export const seed = System.create({ name: "syncedJoinedWorkerTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([stamp, spot])({ [stamp]: 0, [spot]: [0, 0, 0] });
});
export const setStall = System.create({ name: "syncedJoinedWorkerTest/setStall", input: { type: "object", properties: { pause: { type: "number" } } }, resources: { write: [stall] } }, ({ input, resources }) => {
    resources[stall] = input.pause;
});

/** What each run of a synced system saw: the counter, rows, and those not of that tick. */
export type Seen = { counter: number; rows: number; wrong: number };
export const seen: Seen[] = [];

/** Reads every row, which must all be of one tick, pausing at the end of its first chunk while `stall` says so. */
export const watchRows = System.create({ name: "syncedJoinedWorkerTest/watchRows", synced: true, components: { read: [stamp, spot] }, resources: { read: [counter, stall] } }, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value || last.rows === 1000) seen.push(last = { counter: value, rows: 0, wrong: 0 });
    const [x, y, z] = row[spot];
    if (row[stamp] !== value || x !== value || y !== -value || z !== value) last.wrong++;
    last.rows++;
    if (last.rows === 63) pauseAt(resources[stall], value);
});

/** The entities `lookRows` looks up, which the joined thread fills in. */
export const looked: Entity[] = [];

/** Looks up every row by entity, which must all be of one tick, spinning halfway while `stall` says so. */
export const lookRows = System.create({ name: "syncedJoinedWorkerTest/lookRows", synced: true, resources: { read: [counter, stall] }, lookup: { found: { read: [stamp, spot] } } }, ({ resources, lookup }) => {
    const value = resources[counter];
    const run: Seen = { counter: value, rows: 0, wrong: 0 };
    seen.push(run);
    for (let k = 0; k < looked.length; k++) {
        const found = lookup.found(looked[k]);
        if (found === null) continue;
        const [x, y, z] = found[spot];
        if (found[stamp] !== value || x !== value || y !== -value || z !== value) run.wrong++;
        run.rows++;
        if (k === looked.length >> 1) spin(resources[stall]);
    }
});

/** 100 rows heated 0 to 99, which a GPU kernel warms by 100 each run. */
export const spawnHeated = System.create({ name: "syncedJoinedWorkerTest/spawnHeated" }, ({ commands }) => {
    for (let i = 0; i < 100; i++) commands.spawn([heat, rate])({ [heat]: i, [rate]: 1 });
});
export const warm = System.create({ name: "syncedJoinedWorkerTest/warm", kernel: "gpu", components: { read: [rate], write: [heat] } }, row => {
    row[heat] = row[heat] + row[rate] * 100;
});
export const nextPhase = System.create({ name: "syncedJoinedWorkerTest/nextPhase", resources: { write: [phase] } }, ({ resources }) => {
    resources[phase] += 1;
});

/** What `countHot` counted, run by run, on the joined thread. */
export const hot: number[] = [];
export const byHeat = Index.create({ name: "syncedJoinedWorkerTest/byHeat", key: [heat], sorted: true });
/** Counts the rows at least 150 hot, through the sorted index on what the GPU kernel writes. */
export const countHot = System.create({ name: "syncedJoinedWorkerTest/countHot", synced: true, lookup: { hot: { index: byHeat } } }, ({ lookup }) => {
    hot.push(lookup.hot({ ">=": 150 }).length);
});
