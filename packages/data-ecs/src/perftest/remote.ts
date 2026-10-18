/// <reference types="node" />
import { Component } from "../interface/component/component.js";
import { Resource } from "../interface/resource/resource.js";
import { always } from "../interface/resources/always.js";
import { clock } from "../interface/resources/clock.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { backToBack, createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// Benchmarks of a thread joined to a world: its runs, and its observers' mailboxes. The joined thread is `joined.ts`.

export const counter = Symbol("remote/counter");
export const sign = Symbol("remote/sign");
export const rank = Symbol("remote/rank");
export const order = Symbol("remote/order");
declare module "@adobe/data-ecs" {
    export interface Components {
        [rank]: typeof rankTraits;
        [order]: typeof orderTraits;
    }
    export interface Resources {
        [counter]: typeof counterTraits;
        [sign]: typeof signTraits;
    }
}
const counterTraits = Resource.register(counter, { type: { type: "number", default: 0 } });
const signTraits = Resource.register(sign, { type: { type: "number", default: 1 } });
const rankTraits = Component.register(rank, { type: { type: "number" } });
const orderTraits = Component.register(order, { type: { type: "number" } });

/** An empty transaction. */
export const empty = System.create({ name: "remote/empty" }, () => {});
/** Changes the observed resource every tick. */
export const count = System.create({ name: "remote/count", resources: { write: [counter] } }, ({ resources }) => { resources[counter] += 1; });
export const seedRanks = System.create({ name: "remote/seedRanks", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([rank, order])({ [rank]: i, [order]: i });
});
const flip = System.create({ name: "remote/flip", resources: { write: [sign] } }, ({ resources }) => { resources[sign] = -resources[sign]; });
const reverse = System.create({ name: "remote/reverse", kernel: "cpu", components: { read: [rank], write: [order] }, resources: { read: [sign] }, after: [flip] }, (row, { resources }) => {
    row[order] = row[rank] * resources[sign];
});
/** Reverses the entities' order every tick. */
export const reorder = System.create([flip, reverse]);

/** Runs in each timed stretch of `remote run`, and ticks in each of the mailbox benchmarks'. */
export const remoteRuns = 1_000;
export const mailboxTicks = 1_000;
/** Entities `mailbox select 10K` selects. */
export const selected = 10_000;

/** What the joined thread is asked to do, and what it answers. */
export type ToJoined = { readonly kind: "runs"; readonly stretches: number } | { readonly kind: "resource" } | { readonly kind: "select" } | { readonly kind: "stop" };
export type FromJoined = { readonly kind: "ran"; readonly milliseconds: number } | { readonly kind: "observing" } | { readonly kind: "stopped"; readonly last: number; readonly notified: number };

type Joined = { readonly ask: (message: ToJoined) => Promise<FromJoined>; readonly terminate: () => Promise<void> };

const joinedFile = "./joined.js";

/** Starts `joined.ts` on a worker, joining `world` through a channel it's given. */
const startJoined = async (world: World): Promise<Joined> => {
    if (typeof globalThis.Worker === "function") {
        const { port1, port2 } = new MessageChannel();
        world.share(port1);
        const worker = new globalThis.Worker(new URL("./joined.js", import.meta.url), { type: "module" });
        const ask = (message: unknown, transfer: Transferable[] = []): Promise<FromJoined> => new Promise(resolve => {
            worker.onmessage = (event: MessageEvent<FromJoined>) => resolve(event.data);
            worker.postMessage(message, transfer);
        });
        await ask({ kind: "port", port: port2 }, [port2]);
        return { ask, terminate: async () => worker.terminate() };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const { port1, port2 } = new threads.MessageChannel();
    world.share(port1);
    const worker = new threads.Worker(new URL(joinedFile, import.meta.url));
    const ask = (message: unknown, transfer: readonly import("node:worker_threads").Transferable[] = []): Promise<FromJoined> => new Promise(resolve => {
        worker.once("message", resolve);
        worker.postMessage(message, transfer);
    });
    await ask({ kind: "port", port: port2 }, [port2]);
    return { ask, terminate: async () => { await worker.terminate(); } };
};

/** The fastest of `stretches` stretches of `remoteRuns` empty runs from a joined thread, timed there. */
const remoteRun = async (stretches = 5): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    const joined = await startJoined(world);
    try {
        const reply = await joined.ask({ kind: "runs", stretches });
        return reply.kind === "ran" ? reply.milliseconds : NaN;
    }
    finally {
        await joined.terminate();
        await world.dispose();
    }
};

/**
 * The fastest of `stretches` stretches of `mailboxTicks` ticks on the world's thread, driven back to back, of `system`
 * while a joined thread observes through a mailbox what it changes, after one to warm up.
 */
const mailboxBest = async (kind: "resource" | "select", system: System<void>, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    if (kind === "select") await world.run(seedRanks, { count: selected });
    const joined = await startJoined(world);
    let best = Infinity;
    try {
        await joined.ask({ kind });
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = world.observe.resource(clock)(() => {
                if (ticks++ % mailboxTicks !== 0) return;
                const now = performance.now();
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(system);
        });
        const stopped = await joined.ask({ kind: "stop" });
        if (stopped.kind !== "stopped" || stopped.notified === 0) throw new Error(`mailbox ${kind}: the joined thread saw nothing.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

export const remoteBenchmarks: readonly Benchmark[] = [
    {
        name: "remote run",
        operation: "An empty transaction run from a joined thread, through its run slots and completed word: input from another thread, such as the DOM on main driving a world on a worker.",
        per: "runs",
        n: remoteRuns,
        typical: [1, 100],
        best: { bytes: 192, basis: "A run moves at least its slot's line and the posted and completed words' lines between cores." },
        run: () => remoteRun(),
    },
    {
        name: "mailbox resource",
        operation: "Ticks that change one resource a joined thread observes, each writing its mailbox and waking it once: a UI on main showing a world's state.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => mailboxBest("resource", count),
    },
    {
        name: "mailbox select 10K",
        operation: "Ticks that reverse the order of 10K entities a joined thread selects in order, each recomputing the selection and writing it into the mailbox: a sorted list shown on main.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: selected * 24, basis: "Each tick writes 10K 8-byte values, reads them to sort, and writes 10K 8-byte entities." },
        run: () => mailboxBest("select", reorder, 3),
    },
];
