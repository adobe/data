// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index } from "../../interface/indexes/index-type.js";
import { System } from "../../interface/system/system.js";
import type { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import type { F32, Vec3 } from "../../interface/math/index.js";

// Keys and systems both threads of the observer-joined fixtures import: world systems writing every row's stamp each
// tick, and observer systems a joined thread adds, reading those rows as of one sync point.

export const stamp = Symbol("observerJoinedWorkerTest/stamp");
export const spot = Symbol("observerJoinedWorkerTest/spot");
export const counter = Symbol("observerJoinedWorkerTest/counter");
export const stall = Symbol("observerJoinedWorkerTest/stall");
export const heat = Symbol("observerJoinedWorkerTest/heat");
export const rate = Symbol("observerJoinedWorkerTest/rate");
export const phase = Symbol("observerJoinedWorkerTest/phase");
export const word = Symbol("observerJoinedWorkerTest/word");
export const motto = Symbol("observerJoinedWorkerTest/motto");
export const mottoRound = Symbol("observerJoinedWorkerTest/mottoRound");
declare module "@adobe/ecs" {
    export interface Components {
        [stamp]: { type: Schema.Type<{ type: "integer" }> };
        [spot]: { type: Vec3 };
        [heat]: { type: F32 };
        [rate]: { type: F32 };
        [word]: { type: string };
    }
    export interface Resources {
        [counter]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
        [stall]: { type: number };
        [phase]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
        [motto]: { type: string; default: "motto 0" };
        [mottoRound]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
    }
}
/** A string the world writes each tick, which lives in shared memory where the observer system reads it. */
/** A string resource the world writes with the round it's of, which an observer system on the thread reads alone. */
/** Moves on once a joined thread asked the world to run its observer system, so the world's thread knows it did. */
/**
 * Milliseconds the observer systems spin partway through each run, so the world's next writer is likely ready before
 * they finish; negative, they wait there on the gate instead, until the world's thread releases them once a writer
 * copied.
 */

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

/** A tick's word, of a length that varies with it, so records of every size are freed and reused. */
export const wordOf = (value: number): string => `${"·".repeat(value % 37)}${value}`;

/** On the world's thread: the counter moves on once a tick, then every row's stamp, spot and word take it. */
export const count = System.create({  }, ({ resources }) => {
    resources[counter] += 1;
});
export const advance = System.create({ components: { with: [stamp, spot, word] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    row[spot] = [value, -value, value];
    row[word] = wordOf(value);
});
export const ticked = System.create({ systems: [count, advance] });
export const seed = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([stamp, spot, word])({ [stamp]: 0, [spot]: [0, 0, 0], [word]: wordOf(0) });
});
export const setStall = System.create({  }, ({ resources }, input: { readonly pause: number }) => {
    resources[stall] = input.pause;
});

/** What each run of an observer system saw: the counter, rows, and those not of that tick. */
export type Seen = { counter: number; rows: number; wrong: number };
export const seen: Seen[] = [];

/** Reads every row, which must all be of one tick, pausing at the end of its first chunk while `stall` says so. */
export const watchRows = System.create({ observer: true, components: { with: [stamp, spot, word] } }, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value || last.rows === 1000) seen.push(last = { counter: value, rows: 0, wrong: 0 });
    const [x, y, z] = row[spot];
    if (row[stamp] !== value || x !== value || y !== -value || z !== value || row[word] !== wordOf(value)) last.wrong++;
    last.rows++;
    if (last.rows === 63) pauseAt(resources[stall], value);
});

/** The entities `lookRows` looks up, which the joined thread fills in. */
export const looked: Entity[] = [];

/** Looks up every row by entity, which must all be of one tick, spinning halfway while `stall` says so. */
export const lookRows = System.create({ observer: true, lookup: { found: { with: [stamp, spot] } } }, ({ resources, lookup }) => {
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
export const spawnHeated = System.create({}, ({ commands }) => {
    for (let i = 0; i < 100; i++) commands.spawn([heat, rate])({ [heat]: i, [rate]: 1 });
});
export const warm = System.create({ kernel: "gpu", components: { with: [rate, heat] } }, row => {
    row[heat] = row[heat] + row[rate] * 100;
});
export const nextPhase = System.create({  }, ({ resources }) => {
    resources[phase] += 1;
});

/** What `countHot` counted, run by run, on the joined thread. */
export const hot: number[] = [];
export const byHeat = Index.create({ key: [heat], sorted: true });
/** Counts the rows at least 150 hot, through the sorted index on what the GPU kernel writes. */
export const countHot = System.create({ observer: true, lookup: { hot: { index: byHeat } } }, ({ lookup }) => {
    hot.push(lookup.hot({ ">=": 150 }).length);
});

/** On the world's thread: the motto of a round, and the round, every motto of one size. */
export const mottoOf = (round: number): string => `motto ${round % 10}`;
export const setMotto = System.create({  }, ({ resources }, input: { readonly round: number }) => {
    resources[motto] = mottoOf(input.round);
    resources[mottoRound] = input.round;
});

/** What each run of `watchMotto` read, by round. */
export const mottos: { readonly round: number; readonly motto: string }[] = [];

/**
 * Reads only resources, a string among them: waits on the gate first, while `stall` says so, its round plus one, then
 * reads the motto, which must be its round's.
 */
export const watchMotto = System.create({ observer: true }, ({ resources }) => {
    const round = resources[mottoRound];
    pauseAt(resources[stall], round + 1);
    mottos.push({ round, motto: resources[motto] });
});
