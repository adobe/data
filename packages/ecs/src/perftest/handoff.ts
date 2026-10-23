// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { always } from "../interface/resources/always.js";
import { eachTick } from "./observer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { backToBack, createWorld, type CreatedWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { runReported } from "../implementation/world/reports.test-helper.js";

// Benchmarks of systems on a joined thread, which claims "handoffBenchmark": tiers handing off between the world's
// thread and the joined one, and consecutive tiers on the joined one, which run as one task. Their systems reach their
// commands, so they block their tiers rather than run as tails. The joined thread is `joined.ts`.

export const token = Symbol("handoff/token");
declare module "@adobe/ecs" {
    export interface Threads {
        handoffBenchmark: true;
    }
    export interface Resources {
        [token]: { type: { readonly read: () => number } | null; thread: "handoffBenchmark" };
    }
}
/** An object of the joined thread, which places the systems reading it there. */

const here0 = System.create({ name: "handoff/here0" }, () => {});
const there0 = System.create({ name: "handoff/there0", resources: { read: [token] }, after: [here0] }, ({ resources, commands }) => { void resources[token]; void commands; });
const here1 = System.create({ name: "handoff/here1", after: [there0] }, () => {});
const there1 = System.create({ name: "handoff/there1", resources: { read: [token] }, after: [here1] }, ({ resources, commands }) => { void resources[token]; void commands; });
const here2 = System.create({ name: "handoff/here2", after: [there1] }, () => {});
const there2 = System.create({ name: "handoff/there2", resources: { read: [token] }, after: [here2] }, ({ resources, commands }) => { void resources[token]; void commands; });
const here3 = System.create({ name: "handoff/here3", after: [there2] }, () => {});
const there3 = System.create({ name: "handoff/there3", resources: { read: [token] }, after: [here3] }, ({ resources, commands }) => { void resources[token]; void commands; });
const here4 = System.create({ name: "handoff/here4", after: [there3] }, () => {});
const there4 = System.create({ name: "handoff/there4", resources: { read: [token] }, after: [here4] }, ({ resources, commands }) => { void resources[token]; void commands; });
/** Ten tiers alternating the world's thread and the joined one, empty systems. */
export const handoff = System.create({ name: "handoff/ticks", systems: [here0, there0, here1, there1, here2, there2, here3, there3, here4, there4] });

const fused0 = System.create({ name: "handoff/fused0", resources: { read: [token] } }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused1 = System.create({ name: "handoff/fused1", resources: { read: [token] }, after: [fused0] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused2 = System.create({ name: "handoff/fused2", resources: { read: [token] }, after: [fused1] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused3 = System.create({ name: "handoff/fused3", resources: { read: [token] }, after: [fused2] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused4 = System.create({ name: "handoff/fused4", resources: { read: [token] }, after: [fused3] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused5 = System.create({ name: "handoff/fused5", resources: { read: [token] }, after: [fused4] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused6 = System.create({ name: "handoff/fused6", resources: { read: [token] }, after: [fused5] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused7 = System.create({ name: "handoff/fused7", resources: { read: [token] }, after: [fused6] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused8 = System.create({ name: "handoff/fused8", resources: { read: [token] }, after: [fused7] }, ({ resources, commands }) => { void resources[token]; void commands; });
const fused9 = System.create({ name: "handoff/fused9", resources: { read: [token] }, after: [fused8] }, ({ resources, commands }) => { void resources[token]; void commands; });
/** Ten consecutive tiers on the joined thread, empty systems. */
export const fused = System.create({ name: "handoff/fused", systems: [fused0, fused1, fused2, fused3, fused4, fused5, fused6, fused7, fused8, fused9] });

/** Every system the joined thread runs, which it imports so the world can place them there. */
export const handoffSystems: readonly System<void>[] = [handoff, fused];

/** Ticks in each timed stretch. */
export const handoffTicks = 1_000;

/** The joined thread, `joined.ts` on a worker, asked to join through a port and claim "handoffBenchmark". */
type Joined = { readonly terminate: () => Promise<void> };

const joinedFile = "./joined.js";

/** Starts `joined.ts` on a worker, joining `world` through a channel it's given and claiming the benchmark's thread. */
const startClaiming = async (world: CreatedWorld): Promise<Joined> => {
    const message = (port: unknown) => ({ kind: "port", port, threads: ["handoffBenchmark"] });
    let joined: Joined;
    if (typeof globalThis.Worker === "function") {
        const { port1, port2 } = new MessageChannel();
        world.share(port1);
        const worker = new globalThis.Worker(new URL("./joined.js", import.meta.url), { type: "module" });
        await new Promise(resolve => {
            worker.onmessage = resolve;
            worker.postMessage(message(port2), [port2]);
        });
        joined = { terminate: async () => worker.terminate() };
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
        joined = { terminate: async () => { await worker.terminate(); } };
    }
    // Its claims are active once it joined, so the systems run there from the first tick.
    await new Promise<void>(resolve => {
        let done = false;
        const stop = world.threads(threads => {
            if (done || threads.at(-1)?.status !== "joined") return;
            done = true;
            queueMicrotask(() => stop());
            resolve();
        });
    });
    return joined;
};

/** The fastest of `stretches` stretches of `handoffTicks` ticks of `system`, driven back to back, after one to warm up. */
const ticksBest = async (system: System<void>, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const joined = await startClaiming(world);
    let best = Infinity;
    try {
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (ticks++ % handoffTicks !== 0) return;
                const now = performance.now();
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(system);
        });
        const report = await runReported(world, system);
        if (report.failures.length > 0 || report.warnings.length === 0) throw new Error(`handoff: the joined thread didn't run its systems: ${report.failures[0]?.message ?? "none placed there"}.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

export const handoffBenchmarks: readonly Benchmark[] = [
    {
        name: "handoff",
        operation: "Ticks of ten tiers alternating the world's thread and a joined worker, empty systems: five tasks posted and waited for each tick, as when systems that write a worker's objects sit between the world's.",
        per: "ticks",
        n: handoffTicks,
        typical: [1, 1],
        best: { bytes: 5 * 256, basis: "Each of five handoffs moves at least the task's posted, done, payload and completion lines between cores." },
        run: () => ticksBest(handoff),
    },
    {
        name: "fused tiers",
        operation: "Ticks of ten consecutive tiers on a joined worker, empty systems, which run as one task: a worker filling objects whose systems follow one another.",
        per: "ticks",
        n: handoffTicks,
        typical: [1, 1],
        best: { bytes: 256, basis: "One task moves at least its posted, done, payload and completion lines between cores." },
        run: () => ticksBest(fused),
    },
];
