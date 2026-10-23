// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Component } from "../interface/component/component.js";
import { Index } from "../interface/indexes/index-type.js";
import { Resource } from "../interface/resource/resource.js";
import { always } from "../interface/resources/always.js";
import { eachTick } from "./observer.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import type { World } from "../interface/world/world.js";
import { backToBack, createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// Benchmarks of a thread joined to a world: its runs, and what it reads after each sync point, through observer systems
// it adds and the observer factories. The joined thread is `joined.ts`.

export const counter = Symbol("remote/counter");
export const sign = Symbol("remote/sign");
export const rank = Symbol("remote/rank");
export const order = Symbol("remote/order");
export const caption = Symbol("remote/caption");
export const amount = Symbol("remote/amount");
declare module "@adobe/ecs" {
    export interface Components {
        [rank]: { type: number };
        [order]: { type: number };
        [caption]: { type: string };
        [amount]: { type: number };
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
Component.register(caption, { type: { type: "string" } });
Component.register(amount, { type: { type: "number" } });

/** An empty transaction. */
export const empty = System.create({ name: "remote/empty" }, () => {});
/** Changes the observed resource every tick. */
export const count = System.create({ name: "remote/count", resources: { write: [counter] } }, ({ resources }) => { resources[counter] += 1; });
export const seedRanks = System.create({ name: "remote/seedRanks" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([rank, order])({ [rank]: i, [order]: i });
});
const flip = System.create({ name: "remote/flip", resources: { write: [sign] } }, ({ resources }) => { resources[sign] = -resources[sign]; });
const reverse = System.create({ name: "remote/reverse", kernel: "cpu", components: { read: [rank], write: [order] }, resources: { read: [sign] }, after: [flip] }, (row, { resources }) => {
    row[order] = row[rank] * resources[sign];
});
/** Reverses the entities' order every tick. */
export const reorder = System.create([flip, reverse]);

/** What a joined thread's observer systems saw: the last value, and how many runs gave one. */
export const observerSeen = { last: 0, notified: 0 };

/** On a joined thread, after each sync point that changed it: the observed resource. */
export const observerCounter = System.create({ name: "remote/observerCounter", observer: true, resources: { read: [counter], changed: [counter] } }, ({ resources }) => {
    observerSeen.last = resources[counter];
    observerSeen.notified++;
});

/** Every entity with a rank, in entity order. */
const ranked = Index.create({ name: "remote/ranked", key: [], components: { has: [rank, order] } });
const sortedKeys = { keys: new Float64Array(0), entities: new Float64Array(0), positions: new Uint32Array(0) };
/**
 * On a joined thread, after each sync point: the entities in `order`, sorted from a scan of the index of every ranked
 * entity into reused arrays.
 */
export const observerSelect = System.create({ name: "remote/observerSelect", observer: true, lookup: { all: { index: ranked, read: [order] } } }, ({ lookup }) => {
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
    observerSeen.last = count;
    observerSeen.notified++;
});

/** Rows with a caption and an amount, a todo's label and a number, which `retext` and `reamount` rewrite 1% of a tick. */
export const seedCaptions = System.create({ name: "remote/seedCaptions" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([rank, caption, amount])({ [rank]: i, [caption]: `Buy milk and bread #${i}`, [amount]: i });
});
const recaption = System.create({ name: "remote/recaption", components: { read: [rank], write: [caption] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    if (row[rank] % 100 === resources[counter] % 100) row[caption] = `Buy milk and bread #${row[rank]}.${resources[counter]}`;
});
const reamount = System.create({ name: "remote/reamount", components: { read: [rank], write: [amount] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    if (row[rank] % 100 === resources[counter] % 100) row[amount] = row[rank] + resources[counter];
});
/** Rewrites 1% of the captions a tick. */
export const retext = System.create([count, recaption]);
/** Rewrites 1% of the amounts a tick. */
export const reamounted = System.create([count, reamount]);

/** On a joined thread, after each sync point: every row's caption, out of its record. */
export const observerCaptions = System.create({ name: "remote/observerCaptions", observer: true, components: { read: [caption] } }, row => {
    observerSeen.last += row[caption].length;
    observerSeen.notified++;
});
/** On a joined thread, after each sync point: every row's amount. */
export const observerAmounts = System.create({ name: "remote/observerAmounts", observer: true, components: { read: [amount] } }, row => {
    observerSeen.last += row[amount];
    observerSeen.notified++;
});

/** Runs in each timed stretch of `remote run`, and ticks in each of the joined benchmarks'. */
export const remoteRuns = 1_000;
export const joinedTicks = 1_000;
/** Entities `joined observer 10K` selects. */
export const selected = 10_000;

/** What a joined thread reads in a joined benchmark: through an observer system, or the observer factories. */
type Observed = "observer resource" | "observer select" | "observer captions" | "observer amounts" | "factory resource" | "factory select";

/** What the joined thread is asked to do, and what it answers. */
export type ToJoined = { readonly kind: "runs"; readonly stretches: number } | { readonly kind: Observed } | { readonly kind: "stop" };
export type FromJoined = { readonly kind: "ran"; readonly milliseconds: number } | { readonly kind: "observing" } | { readonly kind: "stopped"; readonly last: number; readonly notified: number };

type Joined = { readonly ask: (message: ToJoined) => Promise<FromJoined>; readonly terminate: () => Promise<void> };

const joinedFile = "./joined.js";

/** The observed resource, read by an observer run. */
const counterOf = async (world: World): Promise<number> => {
    let value = 0;
    await world.run(System.create({ observer: true, resources: { read: [counter] } }, ({ resources }) => { value = resources[counter]; }));
    return value;
};

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
 * The fastest of `stretches` stretches of `joinedTicks` ticks on the world's thread, driven back to back, of `system`
 * while a joined thread reads what it changes, after one to warm up.
 */
const joinedBest = async (kind: Observed, system: System<void>, stretches = 5): Promise<number> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const reads = kind.endsWith("resource");
    const rows = kind === "observer captions" || kind === "observer amounts";
    if (rows) await world.run(seedCaptions, { count: selected });
    else if (!reads) await world.run(seedRanks, { count: selected });
    const joined = await startJoined(world);
    let best = Infinity;
    try {
        await joined.ask({ kind });
        await new Promise<void>(resolve => {
            let ticks = 0;
            let stretch = 0;
            let start = 0;
            const unobserve = eachTick(world, () => {
                if (ticks++ % joinedTicks !== 0) return;
                const now = performance.now();
                if (stretch > 1) best = Math.min(best, now - start);
                start = now;
                if (stretch++ <= stretches) return;
                unobserve();
                resolve();
            });
            world.add(system);
        });
        const counted = reads ? await counterOf(world) : 0;
        const stopped = await joined.ask({ kind: "stop" });
        if (stopped.kind !== "stopped" || stopped.notified === 0) throw new Error(`joined ${kind}: the joined thread saw nothing.`);
        // Timed only while the joined thread keeps up: one that stopped being woken costs the world nothing.
        if (reads && stopped.last < counted - joinedTicks) throw new Error(`joined ${kind}: the joined thread saw ${stopped.last} of ${counted}.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
        driver.close();
    }
    return best;
};

/**
 * Ticks the cadence benchmarks give their time for, the ticks they time, after as many to warm up, and the milliseconds
 * between their frames.
 */
export const cadenceTicks = 100;
const cadenceSamples = 1_000;
const cadenceMilliseconds = 2;

/**
 * Frames `milliseconds` apart, as a display's are. The loop asks for the next frame once a tick is done, so each ask
 * after a frame began tells `ended` how long that frame's tick took.
 */
const spaced = (milliseconds: number, ended: (milliseconds: number) => void) => {
    let began = -1;
    return {
        frame: (callback: (time: number) => void): (() => void) => {
            if (began >= 0) ended(performance.now() - began);
            began = -1;
            const timer = setTimeout(() => {
                began = performance.now();
                callback(began);
            }, milliseconds);
            return () => clearTimeout(timer);
        },
    };
};

/**
 * What the world's thread spends on `cadenceTicks` ticks of `system`, from each frame's start until its tick is done,
 * with frames far enough apart that a joined thread observing what it changes keeps up: the cost of `kind` at a
 * display's cadence rather than back to back. A tick's time varies with what else the machine runs, a few ticks taking
 * many times the rest, so it's the mean of the middle half of `cadenceSamples` ticks, about their median, rather than
 * the least; and a mean rather than the median itself, as chromium's timer steps are as long as a tick.
 */
const cadenceMiddle = async (kind: Observed, system: System<void>): Promise<number> => {
    const spent = new Float64Array(cadenceSamples);
    let ticks = 0;
    let finished = (): void => {};
    const done = new Promise<void>(resolve => { finished = resolve; });
    const driver = spaced(cadenceMilliseconds, milliseconds => {
        const tick = ticks++ - cadenceSamples;
        if (tick < 0 || tick >= cadenceSamples) return;
        spent[tick] = milliseconds;
        if (tick === cadenceSamples - 1) finished();
    });
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const joined = await startJoined(world);
    try {
        await joined.ask({ kind });
        world.add(system);
        await done;
        const counted = await counterOf(world);
        const stopped = await joined.ask({ kind: "stop" });
        if (stopped.kind !== "stopped" || stopped.last < counted - 2) throw new Error(`${kind} at a cadence: the joined thread saw ${stopped.kind === "stopped" ? stopped.last : "nothing"} of ${counted}.`);
    }
    finally {
        await joined.terminate();
        await world.dispose();
    }
    spent.sort();
    let middle = 0;
    for (let k = cadenceSamples >> 2; k < cadenceSamples - (cadenceSamples >> 2); k++) middle += spent[k];
    return cadenceTicks * middle / (cadenceSamples >> 1);
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
        name: "joined observer resource",
        operation: "Ticks that change one resource an observer system a joined thread added reads after each sync point, posted to it and waking it once.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => joinedBest("observer resource", count),
    },
    {
        name: "joined observer 10K",
        operation: "Ticks that reverse the order of 10K entities an observer system a joined thread added reads through an index and sorts after each sync point.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: selected * 24, basis: "Each tick writes 10K 8-byte values, reads them to sort, and sorts 10K 8-byte entities." },
        run: () => joinedBest("observer select", reorder, 3),
    },
    {
        name: "joined observer strings 10K",
        operation: "Ticks that rewrite 1% of 10K captions, a todo's label each, while an observer system a joined thread added reads every caption after each sync point, out of its record: a binding on main reading a world on a worker.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: 40_000, basis: "A pass reads at least each row's 4-byte handle." },
        run: () => joinedBest("observer captions", retext, 3),
    },
    {
        name: "joined observer numbers 10K",
        operation: "The same with 10K numbers in place of the captions, as `joined observer strings 10K` measures against.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: 80_000, basis: "A pass reads at least each row's 8-byte number." },
        run: () => joinedBest("observer amounts", reamounted, 3),
    },
    {
        name: "joined resource factory",
        operation: "Ticks that change one resource a joined thread observes through `Observe.resource`, an observer system it added, posted to it and waking it once.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => joinedBest("factory resource", count),
    },
    {
        name: "joined select 10K factory",
        operation: "Ticks that reverse the order of 10K entities a joined thread selects in order through `Observe.select`.",
        per: "ticks",
        n: joinedTicks,
        typical: [1, 1],
        best: { bytes: selected * 24, basis: "Each tick writes 10K 8-byte values, reorders them in the index, and reads 10K 8-byte entities." },
        run: () => joinedBest("factory select", reorder, 3),
    },
    {
        name: "joined resource factory cadence",
        operation: "`joined resource factory` at a display's cadence, frames 2 ms apart, the joined thread keeping up: what the world's thread spends on a tick, from its frame until the tick is done.",
        per: "ticks",
        n: cadenceTicks,
        typical: [1, 1],
        best: { bytes: 64, basis: "A tick reads at least one cache line of its system's state." },
        run: () => cadenceMiddle("factory resource", count),
    },
];
