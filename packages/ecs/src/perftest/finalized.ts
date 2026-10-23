// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Finalizer } from "../interface/finalizer/finalizer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld, type CreatedWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { runReported } from "../implementation/world/reports.test-helper.js";
import type { Vec3 } from "../interface/math/index.js";

// Despawning entities whose objects a joined thread fills, with a finalizer on that thread: the world's thread writes
// each stop's declared struct reads into the thread's stop list and doesn't wait for it. The joined thread is
// `joined.ts`, which imports this module, so it runs the finalizers. A second finalizer, over other entities, reads a
// string resource too, and a third two linear resources, which each sync point's stop list holds copies of.

const spot = Symbol("finalized/spot");
const handle = Symbol("finalized/handle");
const noted = Symbol("finalized/noted");
const note = Symbol("finalized/note");
const measured = Symbol("finalized/measured");
const scale = Symbol("finalized/scale");
const offset = Symbol("finalized/offset");
declare module "@adobe/ecs" {
    export interface Threads {
        finalizedBenchmark: true;
    }
    export interface Components {
        [spot]: { type: Vec3 };
        [handle]: { type: { readonly release: () => void } | null; thread: "finalizedBenchmark" };
        [noted]: { type: { readonly release: () => void } | null; thread: "finalizedBenchmark" };
        [measured]: { type: { readonly release: () => void } | null; thread: "finalizedBenchmark" };
    }
    export interface Resources {
        [note]: { type: string; default: "released" };
        [scale]: { type: number; default: 1 };
        [offset]: { type: Vec3; default: [0, 0, 0] };
    }
}
/** An object of the joined thread, as a DOM node or a GPU handle is. */

/** Entities each timed sync point despawns. */
export const despawnedObjects = 10_000;

/** On the joined thread: what the finalizer released. */
export const releases = { count: 0 };
export const release = Finalizer.create({ name: "finalized/release", components: { read: [handle, spot] } }, row => {
    row[handle]?.release();
    if (row[spot][0] >= 0) releases.count++;
});

/** On the joined thread: the same, reading the world's string resource too. */
export const releaseNoted = Finalizer.create({ name: "finalized/releaseNoted", components: { read: [noted, spot] }, resources: { read: [note] } }, (row, { resources }) => {
    row[noted]?.release();
    if (row[spot][0] >= 0 && resources[note].length > 0) releases.count++;
});

/** On the joined thread: the same, reading two linear resources of the world's too. */
export const releaseMeasured = Finalizer.create({ name: "finalized/releaseMeasured", components: { read: [measured, spot] }, resources: { read: [scale, offset] } }, (row, { resources }) => {
    row[measured]?.release();
    if (row[spot][0] * resources[scale] + resources[offset][0] >= 0) releases.count++;
});

const spawn = System.create({ name: "finalized/spawn" }, ({ commands }) => {
    for (let k = 0; k < despawnedObjects; k++) commands.spawn([spot, handle])({ [spot]: [k, 0, 0], [handle]: null });
});
const despawn = System.create({ name: "finalized/despawn", components: { has: [handle, spot] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
const spawnNoted = System.create({ name: "finalized/spawnNoted" }, ({ commands }) => {
    for (let k = 0; k < despawnedObjects; k++) commands.spawn([spot, noted])({ [spot]: [k, 0, 0], [noted]: null });
});
const spawnMeasured = System.create({ name: "finalized/spawnMeasured" }, ({ commands }) => {
    for (let k = 0; k < despawnedObjects; k++) commands.spawn([spot, measured])({ [spot]: [k, 0, 0], [measured]: null });
});
const despawnMeasured = System.create({ name: "finalized/despawnMeasured", components: { has: [measured, spot] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});
const despawnNoted = System.create({ name: "finalized/despawnNoted", components: { has: [noted, spot] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

const joinedFile = "./joined.js";

/** Starts `joined.ts` on a worker, joined to `world` and claiming the benchmark's thread, once it joined. */
const startClaiming = async (world: CreatedWorld): Promise<{ readonly terminate: () => Promise<void> }> => {
    const message = (port: unknown) => ({ kind: "port", port, threads: ["finalizedBenchmark"] });
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

/**
 * The fastest of `rounds` sync points despawning `despawnedObjects` entities holding the joined thread's objects,
 * timed on the world's thread, each after a spawn and a pause in which the thread finalizes the last.
 */
const despawnObjects = async (spawning: typeof spawn = spawn, despawning: typeof despawn = despawn, rounds = 30): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    const joined = await startClaiming(world);
    let best = Infinity;
    try {
        for (let round = 0; round < rounds; round++) {
            await world.run(spawning);
            const start = performance.now();
            const report = await runReported(world, despawning);
            const time = performance.now() - start;
            if (report.failures.length > 0) throw new Error(`despawn objects: ${report.failures[0].message}`);
            if (round > 1) best = Math.min(best, time);
            // The thread finalizes them and acknowledges, so the next sync point returns their indexes.
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }
    finally {
        await joined.terminate();
        await world.dispose();
    }
    return best;
};

export const finalizedBenchmarks: readonly Benchmark[] = [
    {
        name: "despawn objects 10K",
        operation: "A sync point despawning 10K entities whose objects a joined worker fills, with a finalizer there reading the object and a vec3: releasing DOM nodes or GPU handles, which the world's thread doesn't wait for.",
        per: "despawns",
        n: despawnedObjects,
        typical: [1, 10_000],
        best: { bytes: 56, basis: "Each despawn frees its 8-byte location and entity, and writes its stop: its entity, archetype, row and tag, 20 bytes, and its 12-byte vec3, read and written." },
        run: () => despawnObjects(),
    },
    {
        name: "despawn objects 10K string resource",
        operation: "`despawn objects 10K` with the finalizer reading a string resource too, whose record the sync point's stop list holds a copy of, so the thread reads it as it was before apply.",
        per: "despawns",
        n: despawnedObjects,
        typical: [1, 10_000],
        best: { bytes: 56, basis: "As `despawn objects 10K`: the resource's copy is once per sync point." },
        run: () => despawnObjects(spawnNoted, despawnNoted),
    },
    {
        name: "despawn objects 10K linear resource",
        operation: "`despawn objects 10K` with the finalizer reading a number and a vec3 resource too, which the sync point's stop list holds copies of, so the thread reads them as they were before apply.",
        per: "despawns",
        n: despawnedObjects,
        typical: [1, 10_000],
        best: { bytes: 56, basis: "As `despawn objects 10K`: the resources' copies are once per sync point." },
        run: () => despawnObjects(spawnMeasured, despawnMeasured),
    },
];
