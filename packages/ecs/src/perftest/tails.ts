// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Component } from "../interface/component/component.js";
import { Resource } from "../interface/resource/resource.js";
import { always } from "../interface/resources/always.js";
import { eachTick, ticksAfter } from "./observer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { backToBack, createWorld, type CreatedWorld } from "../implementation/index.js";
import { tailWriters } from "../implementation/world/tails.js";
import type { Benchmark } from "./benchmark.js";
import { reportOf, runReported } from "../implementation/world/reports.test-helper.js";

// Tails: terminal systems on a joined worker, which claims "tailsBenchmark", running after their tick's sync point
// while the world goes on. The joined thread is `joined.ts`.

const place = Symbol("tails/place");
const pose = Symbol("tails/pose");
const surface = Symbol("tails/surface");
const poked = Symbol("tails/poked");
const rowWork = Symbol("tails/rowWork");
const worldWork = Symbol("tails/worldWork");
declare module "@adobe/ecs" {
    export interface Threads {
        tailsBenchmark: true;
    }
    export interface Components {
        [place]: { type: readonly [number, number, number] };
        [pose]: { type: readonly [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] };
    }
    export interface Resources {
        [surface]: { type: { readonly name: string }; thread: "tailsBenchmark" };
        [poked]: { type: number };
        [rowWork]: { type: number };
        [worldWork]: { type: number };
    }
}
Component.register(place, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
Component.register(pose, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 16, maxItems: 16 } });
/** An object of the joined thread, as a canvas or the DOM is, which places the systems reading it there. */
const surfaceStart = { name: "surface" };
Resource.register(surface, { type: { type: "object", properties: { name: { type: "string" } }, default: surfaceStart }, thread: "tailsBenchmark" });
Resource.register(poked, { type: { type: "integer", default: 0 } });
Resource.register(rowWork, { type: { type: "integer", minimum: 0, maximum: 1_000_000, default: 0 } });
Resource.register(worldWork, { type: { type: "number", default: 0 } });

/** What the tails read, so their reads aren't dead. */
export const drawn = { sum: 0 };

/** Rows of the prompt tail, and of the late one's snapshot. */
export const promptRows = 1_000;
export const lateRows = 10_000;
/** Ticks in each timed stretch of the prompt tail. */
export const tailTicks = 1_000;

const spawnPlaces = System.create({ name: "tails/spawnPlaces" }, ({ commands }) => {
    for (let k = 0; k < promptRows; k++) commands.spawn([place])({ [place]: [k, 0, 0] });
});
const spawnPoses = System.create({ name: "tails/spawnPoses" }, ({ commands }) => {
    for (let k = 0; k < lateRows; k++) commands.spawn([place, pose])({ [place]: [k, 0, 0], [pose]: [k, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
});

const here = System.create({ name: "tails/here" }, () => {});
/** On the joined thread, terminal: reads every row's place, as a DOM-writing system reads positions. */
const draw = System.create({ name: "tails/draw", components: { read: [place] }, resources: { read: [surface] } }, (row, { resources }) => {
    if (resources[surface] === surfaceStart) drawn.sum += row[place][0];
});
/** A tick of a world system and a 1,000-row tail that finishes before the next tick needs it. */
export const promptTick = System.create({ name: "tails/promptTick", systems: [here, draw] });

/** On the joined thread, ahead of the late tail: busy for a while, as a main thread is with layout. */
const busy = System.create({ name: "tails/busy", resources: { read: [surface] } }, ({ resources }) => {
    const until = performance.now() + 4;
    while (performance.now() < until && resources[surface] === surfaceStart);
});
/** On the joined thread, terminal, after `busy`: reads every row's place and pose, and the resource `poke` writes. */
const copied = System.create({ name: "tails/copied", components: { read: [place, pose] }, resources: { read: [surface, poked] }, after: [busy] }, (row, { resources }) => {
    if (resources[surface] === surfaceStart) drawn.sum += row[place][0] + row[pose][15] + resources[poked];
});
export const lateTick = System.create({ name: "tails/lateTick", systems: [busy, copied] });
/** On the world's thread: writes what the late tail reads, so it copies the rest of the tail's reads first. */
const poke = System.create({ name: "tails/poke", resources: { write: [poked] } }, ({ resources }) => {
    resources[poked] += 1;
});
const nothing = System.create({ name: "tails/nothing" }, () => {});

/** Steps of work each row of the overlapping tail does, about 2.5 ms over 10,000 rows; the world's work after its writer. */
export const overlapWork = 40;
export const overlapWorldMilliseconds = 2;
/** Ticks in each timed stretch of the overlapping tail. */
export const overlapTicks = 100;

/** On the world's thread: writes every row's place, which the last tick's tail still reads. */
const overlapWrite = System.create({ name: "tails/overlapWrite", components: { write: [place] } }, row => {
    row[place] = [row[place][0], 1, 0];
});
/** On the world's thread, after the writer: the rest of the tick's work, as systems reading what it wrote do. */
const overlapSimulate = System.create({ name: "tails/overlapSimulate", resources: { read: [worldWork] }, after: [overlapWrite] }, ({ resources }) => {
    const until = performance.now() + resources[worldWork];
    while (performance.now() < until);
});
/** On the joined thread, terminal: works on every row's place and pose, as a DOM-writing system on main does. */
const overlapDraw = System.create({ name: "tails/overlapDraw", components: { read: [place, pose] }, resources: { read: [surface, rowWork] }, after: [overlapWrite] }, (row, { resources }) => {
    if (resources[surface] !== surfaceStart) return;
    let sum = row[place][0] + row[pose][15];
    for (let k = resources[rowWork]; k > 0; k--) sum = Math.sqrt(sum + k);
    drawn.sum += sum;
});
export const overlapTick = System.create({ name: "tails/overlapTick", systems: [overlapWrite, overlapSimulate, overlapDraw] });
const setOverlap = System.create({ name: "tails/setOverlap", resources: { write: [rowWork, worldWork] } }, ({ resources }) => {
    resources[rowWork] = overlapWork;
    resources[worldWork] = overlapWorldMilliseconds;
});

/** Every system the joined thread runs, which it imports so the world can place them there. */
export const tailSystems: readonly System<void>[] = [promptTick, lateTick, overlapTick];

const joinedFile = "./joined.js";

/** Starts `joined.ts` on a worker, joined to `world` and claiming the benchmark's thread, once it joined. */
const startClaiming = async (world: CreatedWorld): Promise<{ readonly terminate: () => Promise<void> }> => {
    const message = (port: unknown) => ({ kind: "port", port, threads: ["tailsBenchmark"] });
    let terminate: () => Promise<void>;
    if (typeof globalThis.Worker === "function") {
        const { port1, port2 } = new MessageChannel();
        world.share(port1);
        const worker = new globalThis.Worker(new URL("./joined.js", import.meta.url), { type: "module" });
        await new Promise(resolve => {
            worker.onmessage = resolve;
            worker.postMessage(message(port2), [port2]);
        });
        terminate = async () => worker.terminate();
    }
    else {
        const threads = globalThis.process.getBuiltinModule("node:worker_threads");
        const { port1, port2 } = new threads.MessageChannel();
        world.share(port1);
        const worker = new threads.Worker(new URL(joinedFile, import.meta.url));
        await new Promise(resolve => {
            worker.once("message", resolve);
            worker.postMessage(message(port2), [port2]);
        });
        terminate = async () => { await worker.terminate(); };
    }
    await new Promise<void>(resolve => {
        let done = false;
        const stop = world.threads(threads => {
            if (done || threads.at(-1)?.status !== "joined") return;
            done = true;
            queueMicrotask(() => stop());
            resolve();
        });
    });
    return { terminate };
};

/** The fastest of `stretches` stretches of `tailTicks` ticks with the prompt tail, driven back to back. */
const prompt = async (stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const joined = await startClaiming(world);
    let best = Infinity;
    try {
        await world.run(spawnPlaces);
        const report = await runReported(world, promptTick);
        if (report.failures.length > 0 || report.warnings.length > 0) throw new Error(`tail prompt: the tail didn't run as one: ${report.failures[0]?.message ?? report.warnings[0]?.message}.`);
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (ticks++ % tailTicks !== 0) return;
                const now = performance.now();
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(promptTick);
        });
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

/**
 * The fastest of `rounds` runs writing what a late tail of 10,000 rows reads, each right after a tick posted it behind
 * a busy system on its thread, so the run copies the tail's reads first.
 */
const late = async (rounds = 30): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0 }, { loop: driver });
    const joined = await startClaiming(world);
    let best = Infinity;
    try {
        await world.run(spawnPoses);
        world.add(lateTick);
        for (let round = 0; round < rounds; round++) {
            // Each run makes the next beat tick, which posts the tail behind `busy`.
            const ticked = ticksAfter(world, 1);
            await world.run(nothing);
            await ticked;
            const start = performance.now();
            const run = await world.run(poke);
            const time = performance.now() - start;
            // Read by a run of its own, after the timed one.
            const report = await reportOf(world, run);
            if (report.failures.length > 0) throw new Error(`tail late snapshot: ${report.failures[0].message}`);
            if (round > 1) best = Math.min(best, time);
            // The tail and the tick the run made finish.
            await new Promise(resolve => setTimeout(resolve, 12));
        }
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

/**
 * The fastest of `stretches` stretches of `overlapTicks` ticks writing what the last tick's tail reads, driven back to
 * back: with snapshots, or with the writer waiting for the tail to finish.
 */
const overlap = async (waiting: boolean, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const joined = await startClaiming(world);
    let best = Infinity;
    tailWriters.wait = waiting;
    try {
        await world.run(spawnPoses);
        await world.run(setOverlap);
        const report = await runReported(world, overlapTick);
        if (report.failures.length > 0 || report.warnings.length > 0) throw new Error(`tail overlap: the tail didn't run as one: ${report.failures[0]?.message ?? report.warnings[0]?.message}.`);
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (ticks++ % overlapTicks !== 0) return;
                const now = performance.now();
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(overlapTick);
        });
    }
    finally {
        tailWriters.wait = false;
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

const overlapOperation = "Ticks writing every row's place, which the last tick's tail on a joined worker still reads, then working 2 ms, while the tail works about 2.5 ms over 10,000 rows of a place and a pose: main's DOM work and the world's work after its writer that together outlast a frame or a fixed step, though each fits.";

export const tailBenchmarks: readonly Benchmark[] = [
    {
        name: "tail prompt",
        operation: "Ticks of a world system and a terminal system on a joined worker over 1,000 rows, which runs after the sync point and finishes before the next tick needs it: a DOM-writing system on main that keeps up.",
        per: "ticks",
        n: tailTicks,
        typical: [1, 1],
        best: { bytes: 256 + promptRows * 12, basis: "One task moves its posted, done, payload and completion lines between cores, and the tail reads each row's 12-byte vec3." },
        run: () => prompt(),
    },
    {
        name: "tail late snapshot 10K",
        operation: "A run writing what a late tail on a joined worker reads, 10,000 passing rows of a vec3 and a mat4: the copy of the tail's reads it makes first, as when main is busy when the next tick writes positions.",
        per: "rows copied",
        n: lateRows,
        typical: [100, 10_000],
        best: { bytes: 2 * (12 + 64) + 20, basis: "Each row's 12-byte vec3 and 64-byte mat4 are read and written, and its position, archetype, row and entity, 20 bytes, written." },
        run: () => late(),
    },
    {
        name: "tail overlap",
        operation: `${overlapOperation} The writer copies the rows the tail hasn't read, so the tick and the tail overlap.`,
        per: "ticks",
        n: overlapTicks,
        typical: [1, 1],
        best: { bytes: 2 * lateRows * (12 + 64), basis: "The world copies each row's 12-byte vec3 and 64-byte mat4 the tail hasn't read, and the tail reads them, beyond the work each side does." },
        run: () => overlap(false),
    },
    {
        name: "tail overlap waiting",
        operation: `${overlapOperation} The writer waits for the tail to finish instead, the alternative \`tail overlap\` is measured against.`,
        per: "ticks",
        n: overlapTicks,
        typical: [1, 1],
        best: { bytes: lateRows * (12 + 64), basis: "The tail reads each row's 12-byte vec3 and 64-byte mat4, beyond the work each side does." },
        run: () => overlap(true),
    },
];
