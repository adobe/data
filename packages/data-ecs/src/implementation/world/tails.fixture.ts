/// <reference types="node" />
import type { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { backToBack } from "./loop.js";
import { tailWriters } from "./tails.js";
import type { FromTailsWorker, ToTailsWorker } from "./tails-worker.fixture.js";
import { counter, noStall, seed, setSpawning, setStall, stallAtChunk, stallBefore, tallied, ticked } from "./tails.test-helper.js";

/**
 * Scenarios of tails on a joined worker, run built in node and from source in chromium: a terminal system there over
 * every row while the world ticks on, reading them where they are, from a snapshot when it's late, or both across a
 * switch at a chunk; a prompt one that never needs a snapshot; and a sync point growing what a late one reads.
 */

type Worker = { readonly ask: (message: ToTailsWorker, transfer?: readonly unknown[]) => Promise<FromTailsWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./tails-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./tails-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromTailsWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromTailsWorker): void => {
                if ("protocol" in data) return;
                worker.off("message", reply);
                resolve(data);
            };
            worker.on("message", reply);
            worker.postMessage(message, transfer.filter(port => port instanceof threads.MessagePort));
        }),
        terminate: async () => { await worker.terminate(); },
    };
};

const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const joined = async (world: CreatedWorld): Promise<{ readonly worker: Worker }> => {
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    await until(world.threads, threads => threads.at(-1)?.status === "joined");
    return { worker };
};

/** Ticks on until the counter passed `ticks` more. */
const ticks = async (world: World, more: number): Promise<void> => {
    const now = await until(world.observe.resource(counter), () => true);
    await until(world.observe.resource(counter), value => value >= now + more);
};

/** What the worker's tails saw: their runs, those that saw another tick's structs or labels, the fewest rows, and snapshots. */
const summary = async (worker: Worker) => {
    const reply = await worker.ask({ kind: "seen" });
    if (reply.kind !== "seen") throw new Error("tails: the worker didn't say what it saw.");
    const { seen } = reply;
    return {
        runs: seen.length,
        wrong: seen.reduce((sum, run) => sum + run.wrong, 0),
        labels: seen.reduce((sum, run) => sum + run.labels, 0),
        fewest: Math.min(...seen.map(run => run.rows)),
        most: Math.max(...seen.map(run => run.rows)),
        late: reply.late,
        switched: reply.switched,
        // Each run of `tally` after the first counts every row the watcher wrote the tick before.
        uncounted: reply.changed.filter(([value, rows]) => value > 2 && rows !== seen.find(run => run.counter === value - 1)?.rows).length,
        counted: reply.changed.length,
    };
};

const within = <T>(promise: Promise<T>, milliseconds: number, otherwise: T): Promise<T> =>
    Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(otherwise), milliseconds))]);

/**
 * A world and its joined thread on the worker, the thread leaving with two runs of its tails queued: what they
 * reported, or null when the worker never answered, as when its world waits forever for a gone thread's tail.
 */
export const leaveQueued = async () => {
    const worker = start();
    const reply = await within(worker.ask({ kind: "leave queued" }), 10000, null);
    await worker.terminate();
    return reply !== null && reply.kind === "left" ? { skipped: reply.skipped, after: reply.after } : null;
};

/** 1,000 rows while the world ticks back to back: prompt, then stalling at the end of a chunk, then late. */
export const continuous = async () => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const { worker } = await joined(world);
    await world.run(seed, { count: 1000 });
    world.add(ticked);
    await ticks(world, 30);
    await world.run(setStall, { mode: stallAtChunk, pause: 3 });
    await ticks(world, 30);
    await world.run(setStall, { mode: stallBefore, pause: 3 });
    await ticks(world, 30);
    await world.run(setStall, { mode: noStall, pause: 0 });
    await ticks(world, 10);
    await world.dispose();
    const seen = await summary(worker);
    await worker.terminate();
    driver.close();
    return seen;
};

/** As `continuous`, with writers waiting until each tail is done rather than copying what it hasn't read. */
export const waiting = async () => {
    tailWriters.wait = true;
    try {
        return await continuous();
    }
    finally {
        tailWriters.wait = false;
    }
};

/**
 * Frames the caller gives one at a time: `next` resolves once the loop asked for its next beat and runs it, so a tick
 * starts only when the caller says, however slowly the machine runs.
 */
const gatedFrames = () => {
    let pending: ((time: number) => void) | null = null;
    let requested: (() => void) | null = null;
    return {
        frame: (callback: (time: number) => void): (() => void) => {
            pending = callback;
            requested?.();
            requested = null;
            return () => {
                if (pending === callback) pending = null;
            };
        },
        next: async (): Promise<void> => {
            if (pending === null) await new Promise<void>(resolve => { requested = resolve; });
            const callback = pending;
            pending = null;
            callback?.(performance.now());
        },
    };
};

/** Asks what the worker's tails saw until the watcher's run for `value` read every one of `rows` rows. */
const watched = async (worker: Worker, value: number, rows: number): Promise<void> => {
    for (;;) {
        const reply = await worker.ask({ kind: "seen" });
        if (reply.kind === "seen" && reply.seen.some(run => run.counter === value && run.rows === rows)) return;
    }
};

/**
 * 1,000 rows, each tick starting only once the last one's tail on the worker read them all: the tail finished before
 * the next tick writes, however slowly either thread runs.
 */
export const prompt = async () => {
    const frames = gatedFrames();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: frames });
    const { worker } = await joined(world);
    await world.run(seed, { count: 1000 });
    world.add(ticked);
    for (let tick = 1; tick <= 30; tick++) {
        await frames.next();
        await until(world.observe.resource(counter), value => value >= tick);
        await watched(worker, tick, 1000);
    }
    await world.dispose();
    const seen = await summary(worker);
    await worker.terminate();
    return seen;
};

/** A late tail while a sync point spawns 20,000 rows into the archetype it reads, growing it and the move log. */
export const growing = async () => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const { worker } = await joined(world);
    await world.run(seed, { count: 1000 });
    await world.run(setStall, { mode: stallBefore, pause: 3 });
    world.add(tallied);
    await ticks(world, 5);
    await world.run(setSpawning, { count: 20000 });
    await ticks(world, 10);
    await world.run(setStall, { mode: noStall, pause: 0 });
    await ticks(world, 5);
    await world.dispose();
    const seen = await summary(worker);
    await worker.terminate();
    driver.close();
    return seen;
};
