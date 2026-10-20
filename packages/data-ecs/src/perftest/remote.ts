/// <reference types="node" />
import { Component } from "../interface/component/component.js";
import { Index } from "../interface/indexes/index-type.js";
import { Observe } from "../interface/observe/observe.js";
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
        [rank]: { type: number };
        [order]: { type: number };
    }
    export interface Resources {
        [counter]: { type: number };
        [sign]: { type: number };
    }
}
Resource.register(counter, { type: { type: "number", default: 0 } });
Resource.register(sign, { type: { type: "number", default: 1 } });
Component.register(rank, { type: { type: "number" } });
Component.register(order, { type: { type: "number" } });

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

/** What a joined thread's synced systems saw: the last value, and how many runs gave one. */
export const syncedSeen = { last: 0, notified: 0 };

/** On a joined thread, after each sync point that changed it: the observed resource, as `mailbox resource` gives it. */
export const syncedCounter = System.create({ name: "remote/syncedCounter", synced: true, resources: { read: [counter], changed: [counter] } }, ({ resources }) => {
    syncedSeen.last = resources[counter];
    syncedSeen.notified++;
});

/** Every entity with a rank, in entity order. */
const ranked = Index.create({ name: "remote/ranked", key: [], components: { has: [rank, order] } });
const sortedKeys = { keys: new Float64Array(0), entities: new Float64Array(0), positions: new Uint32Array(0) };
/**
 * On a joined thread, after each sync point: the entities in `order`, as `mailbox select 10K` selects them, sorted from
 * a scan of the index of every ranked entity into reused arrays.
 */
export const syncedSelect = System.create({ name: "remote/syncedSelect", synced: true, lookup: { all: { index: ranked, read: [order] } } }, ({ lookup }) => {
    const list = lookup.all();
    const count = list.length;
    if (sortedKeys.keys.length < count) {
        sortedKeys.keys = new Float64Array(count);
        sortedKeys.entities = new Float64Array(count);
        sortedKeys.positions = new Uint32Array(count);
    }
    const { keys, entities } = sortedKeys;
    for (let k = 0; k < count; k++) {
        const row = list.at(k);
        if (row === null) continue;
        keys[k] = row[order];
        entities[k] = row.entity;
    }
    const positions = sortedKeys.positions.subarray(0, count);
    for (let k = 0; k < count; k++) positions[k] = k;
    positions.sort((a, b) => keys[a] - keys[b] || entities[a] - entities[b]);
    syncedSeen.last = count;
    syncedSeen.notified++;
});

/** Runs in each timed stretch of `remote run`, and ticks in each of the mailbox benchmarks'. */
export const remoteRuns = 1_000;
export const mailboxTicks = 1_000;
/** Entities `mailbox select 10K` selects. */
export const selected = 10_000;

/** What a joined thread observes or runs in a mailbox benchmark: through its own observers, a synced system, or the observer factories. */
type Observed = "resource" | "select" | "synced resource" | "synced select" | "factory resource" | "factory select";

/** What the joined thread is asked to do, and what it answers. */
export type ToJoined = { readonly kind: "runs"; readonly stretches: number } | { readonly kind: Observed } | { readonly kind: "stop" };
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
const mailboxBest = async (kind: Observed, system: System<void>, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const reads = kind.endsWith("resource");
    if (!reads) await world.run(seedRanks, { count: selected });
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
        const counted = reads ? await Observe.toPromise(world.observe.resource(counter)) : 0;
        const stopped = await joined.ask({ kind: "stop" });
        if (stopped.kind !== "stopped" || stopped.notified === 0) throw new Error(`mailbox ${kind}: the joined thread saw nothing.`);
        // Timed only while the joined thread keeps up: one that stopped being woken costs the world nothing.
        if (reads && stopped.last < counted - mailboxTicks) throw new Error(`mailbox ${kind}: the joined thread saw ${stopped.last} of ${counted}.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

/** Ticks in each timed stretch of the cadence benchmarks, and the milliseconds between their frames. */
export const cadenceTicks = 100;
const cadenceMilliseconds = 2;

/** Frames `milliseconds` apart, as a display's are, each noting when it began. */
const spaced = (milliseconds: number) => {
    let began = 0;
    return {
        began: (): number => began,
        frame: (callback: (time: number) => void): (() => void) => {
            const timer = setTimeout(() => {
                began = performance.now();
                callback(began);
            }, milliseconds);
            return () => clearTimeout(timer);
        },
    };
};

/**
 * The least the world's thread spends on `cadenceTicks` ticks of `system`, from each frame's start until the tick's
 * observers are notified, over `stretches` stretches after one to warm up, with frames far enough apart that a joined
 * thread observing what it changes keeps up: the cost of `kind` at a display's cadence rather than back to back.
 */
const cadenceBest = async (kind: Observed, system: System<void>, stretches = 8): Promise<number> => {
    const driver = spaced(cadenceMilliseconds);
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const joined = await startJoined(world);
    let best = Infinity;
    try {
        await joined.ask({ kind });
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let spent = 0;
            const unobserve = world.observe.resource(clock)(() => {
                spent += performance.now() - driver.began();
                if (++ticks % cadenceTicks !== 0) return;
                if (stretch > 0) best = Math.min(best, spent);
                spent = 0;
                if (stretch++ < stretches) return;
                unobserve();
                resolve();
            });
            world.add(system);
        });
        const counted = await Observe.toPromise(world.observe.resource(counter));
        const stopped = await joined.ask({ kind: "stop" });
        if (stopped.kind !== "stopped" || stopped.last < counted - 2) throw new Error(`${kind} at a cadence: the joined thread saw ${stopped.kind === "stopped" ? stopped.last : "nothing"} of ${counted}.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
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
    {
        name: "joined synced resource",
        operation: "Ticks that change one resource a synced system a joined thread added reads after each sync point, posted to it and waking it once: `mailbox resource` as a synced system.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => mailboxBest("synced resource", count),
    },
    {
        name: "joined synced 10K",
        operation: "Ticks that reverse the order of 10K entities a synced system a joined thread added reads through an index and sorts after each sync point: `mailbox select 10K` as a synced system.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: selected * 24, basis: "Each tick writes 10K 8-byte values, reads them to sort, and sorts 10K 8-byte entities." },
        run: () => mailboxBest("synced select", reorder, 3),
    },
    {
        name: "joined resource factory",
        operation: "Ticks that change one resource a joined thread observes through the observer factories, a synced system it added, posted to it and waking it once: `mailbox resource` through `Observe.resource`.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => mailboxBest("factory resource", count),
    },
    {
        name: "joined select 10K factory",
        operation: "Ticks that reverse the order of 10K entities a joined thread selects in order through the observer factories, through a sorted index the world keeps for it: `mailbox select 10K` through `Observe.select`.",
        per: "ticks",
        n: mailboxTicks,
        typical: [1, 1],
        best: { bytes: selected * 24, basis: "Each tick writes 10K 8-byte values, reorders them in the index, and reads 10K 8-byte entities." },
        run: () => mailboxBest("factory select", reorder, 3),
    },
    {
        name: "mailbox resource cadence",
        operation: "`mailbox resource` at a display's cadence, frames 2 ms apart, the joined thread keeping up: what the world's thread spends on a tick, from its frame until its observers are notified.",
        per: "ticks",
        n: cadenceTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => cadenceBest("resource", count),
    },
    {
        name: "joined resource factory cadence",
        operation: "`joined resource factory` at a display's cadence, frames 2 ms apart, the joined thread keeping up: what the world's thread spends on a tick, from its frame until its observers are notified.",
        per: "ticks",
        n: cadenceTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => cadenceBest("factory resource", count),
    },
];
