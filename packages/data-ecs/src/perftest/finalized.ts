/// <reference types="node" />
import { threadStatus } from "../interface/components/index.js";
import { Component } from "../interface/component/component.js";
import type { Entity } from "../interface/entity/entity.js";
import { Finalizer } from "../interface/finalizer/finalizer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// Despawning entities whose objects a joined thread fills, with a finalizer on that thread: the world's thread writes
// each stop's declared struct reads into the thread's stop list and doesn't wait for it. The joined thread is
// `joined.ts`, which imports this module, so it runs the finalizer.

const spot = Symbol("finalized/spot");
const handle = Symbol("finalized/handle");
declare module "@adobe/data-ecs" {
    export interface Threads {
        finalizedBenchmark: true;
    }
    export interface Components {
        [spot]: typeof spotTraits;
        [handle]: typeof handleTraits;
    }
}
const spotTraits = Component.register(spot, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
/** An object of the joined thread, as a DOM node or a GPU handle is. */
const handleTraits = Component.register(handle, { type: Component.object<{ readonly release: () => void } | null>(), thread: "finalizedBenchmark" });

/** Entities each timed sync point despawns. */
export const despawnedObjects = 10_000;

/** On the joined thread: what the finalizer released. */
export const releases = { count: 0 };
export const release = Finalizer.create({ name: "finalized/release", components: { read: [handle, spot] } }, row => {
    row[handle]?.release();
    if (row[spot][0] >= 0) releases.count++;
});

const spawn = System.create({ name: "finalized/spawn" }, ({ commands }) => {
    for (let k = 0; k < despawnedObjects; k++) commands.spawn([spot, handle])({ [spot]: [k, 0, 0], [handle]: null });
});
const despawn = System.create({ name: "finalized/despawn", components: { has: [handle, spot] } }, (row, { commands }) => {
    commands.despawn(row.entity);
});

const joinedFile = "./joined.js";

/** Starts `joined.ts` on a worker, joined to `world` and claiming the benchmark's thread, once it joined. */
const startClaiming = async (world: World): Promise<{ readonly terminate: () => Promise<void> }> => {
    const message = (port: unknown) => ({ kind: "port", port, threads: ["finalizedBenchmark"] });
    let thread: Entity;
    let terminate: () => Promise<void>;
    if (typeof globalThis.Worker === "function") {
        const { port1, port2 } = new MessageChannel();
        thread = world.share(port1);
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
        thread = world.share(port1);
        const worker = new threads.Worker(new URL(joinedFile, import.meta.url));
        await new Promise(resolve => {
            worker.once("message", resolve);
            worker.postMessage(message(port2), [port2]);
        });
        terminate = async () => { await worker.terminate(); };
    }
    await new Promise<void>(resolve => {
        let done = false;
        const stop = world.observe.entity(thread, { required: [threadStatus] })(value => {
            if (done || value?.[threadStatus] !== "joined") return;
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
const despawnObjects = async (rounds = 30): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    const joined = await startClaiming(world);
    let best = Infinity;
    try {
        for (let round = 0; round < rounds; round++) {
            await world.run(spawn);
            const start = performance.now();
            const report = await world.run(despawn);
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
];
