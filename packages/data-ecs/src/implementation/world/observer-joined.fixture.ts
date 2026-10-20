/// <reference types="node" />
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, type CreatedWorld } from "./create.js";
import type { LoopPlatform } from "./loop.js";
import type { FromObserverWorker, ToObserverWorker } from "./observer-joined-worker.fixture.js";
import { counter, gateWords, holdWord, phase, reachedWord, releasedWord, seed, setStall, spawnHeated, ticked, warm } from "./observer-joined.test-helper.js";
import { tailWriters } from "./tails.js";

/**
 * Scenarios of observer systems a joined worker adds, run built in node and from source in chromium: a system over
 * every row, and one looking every row up by entity, while the world ticks on writing them, prompt and stalling
 * partway so the world's next writer is likely ready before they finish; then, for the system over every row, each
 * order forced, whatever the machine's timing: a writer ready while a run is partway, and a thread that fell behind.
 */

type Worker = { readonly ask: (message: ToObserverWorker, transfer?: readonly unknown[]) => Promise<FromObserverWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./observer-joined-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./observer-joined-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromObserverWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromObserverWorker): void => {
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

const joined = async (world: CreatedWorld): Promise<Worker> => {
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    await until(world.threads, threads => threads.at(-1)?.status === "joined");
    return worker;
};

/**
 * Frames back to back, as `backToBack`, until `gate`: from then on, a tick starts only when `next` says, and `asked`
 * resolves once the loop asked for its next beat, so the last tick's sync point and posts are done.
 */
const steppedFrames = (): Partial<LoopPlatform> & { readonly gate: () => void; readonly asked: () => Promise<void>; readonly next: () => Promise<void>; readonly close: () => void } => {
    const channel = new MessageChannel();
    let pending: ((time: number) => void) | null = null;
    let requested: (() => void) | null = null;
    let gated = false;
    const call = (): void => {
        const callback = pending;
        pending = null;
        callback?.(performance.now());
    };
    channel.port1.onmessage = () => { if (!gated) call(); };
    const asked = async (): Promise<void> => {
        if (pending === null) await new Promise<void>(resolve => { requested = resolve; });
    };
    return {
        frame: callback => {
            pending = callback;
            requested?.();
            requested = null;
            if (!gated) channel.port2.postMessage(null);
            return () => {
                if (pending === callback) pending = null;
            };
        },
        gate: () => { gated = true; },
        asked,
        next: async () => {
            await asked();
            call();
        },
        close: () => {
            channel.port1.close();
            channel.port2.close();
        },
    };
};

/** A task later, so other threads' messages and the world's waits settle between checks. */
const later = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Ticks on until the counter passed `more` more. */
const ticks = async (world: World, more: number): Promise<void> => {
    const now = await until(Observe.resource(world, counter), () => true);
    await until(Observe.resource(world, counter), value => value >= now + more);
};

/** What the worker's observer system saw so far. */
const seenBy = async (worker: Worker): Promise<Extract<FromObserverWorker, { readonly kind: "seen" }>> => {
    const reply = await worker.ask({ kind: "seen" });
    if (reply.kind !== "seen") throw new Error("observer-joined: the worker didn't say what it saw.");
    return reply;
};

/**
 * Gated, a run waiting partway, at the end of its first chunk, as each next step of the world starts: a tick, four
 * times, then a run setting the stall back. Each run is released once the step's writer copied the rest, so it reads
 * that from the copy. Returns the runs released and the runs that read from a copy meanwhile.
 */
const writerReadyPartway = async (world: World, worker: Worker, frames: ReturnType<typeof steppedFrames>, words: Int32Array) => {
    const switched = (await seenBy(worker)).switched;
    let released = Atomics.load(words, releasedWord);
    const releases: number[] = [];
    const step = async (start: () => Promise<unknown>): Promise<void> => {
        while (Atomics.load(words, reachedWord) <= released) await later();
        const reached = Atomics.load(words, reachedWord);
        const copies = tailWriters.copies;
        const started = start();
        while (tailWriters.copies === copies) await later();
        released = reached;
        releases.push(reached);
        Atomics.store(words, releasedWord, reached);
        Atomics.notify(words, releasedWord);
        await started;
    };
    await world.run(setStall, { pause: -1 });
    for (let k = 0; k < 4; k++) await step(frames.next);
    await step(() => world.run(setStall, { pause: 0 }));
    return { released: releases, switched: (await seenBy(worker)).switched - switched };
};

/**
 * Gated, the thread holds its event loop while the world ticks three times, then is released: it fell behind, and
 * runs once, for the newest sync point. Returns the counters of the runs after the hold began, and the newest.
 */
const fellBehind = async (world: World, worker: Worker, frames: ReturnType<typeof steppedFrames>, words: Int32Array) => {
    await worker.ask({ kind: "hold" });
    const from = await until(Observe.resource(world, counter), () => true);
    for (let k = 0; k < 3; k++) await frames.next();
    await frames.asked();
    const newest = from + 3;
    Atomics.store(words, holdWord, 1);
    Atomics.notify(words, holdWord);
    for (;;) {
        const { seen } = await seenBy(worker);
        if (seen.some(run => run.counter === newest && run.rows === 1000)) return { behind: seen.filter(run => run.counter > from).map(run => run.counter), newest };
        await later();
    }
};

/**
 * 1,000 rows while the world ticks back to back writing them, the worker's observer system over them prompt, then
 * stalling partway, then prompt again; then, for the system over every row, gated, a writer ready while a run is
 * partway, and the thread falling behind: what each run saw, how many ran from a copy, and how many ran.
 */
export const continuous = async (system: "rows" | "lookups") => {
    const frames = steppedFrames();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: frames });
    const worker = await joined(world);
    const words = new Int32Array(new SharedArrayBuffer(gateWords * 4));
    await world.run(seed, { count: 1000 });
    world.add(ticked);
    await worker.ask({ kind: "add", system, gate: words });
    await ticks(world, 30);
    await world.run(setStall, { pause: 3 });
    await ticks(world, 30);
    await world.run(setStall, { pause: 0 });
    await ticks(world, 10);
    let partway: Awaited<ReturnType<typeof writerReadyPartway>> | null = null;
    let behind: Awaited<ReturnType<typeof fellBehind>> | null = null;
    if (system === "rows") {
        frames.gate();
        partway = await writerReadyPartway(world, worker, frames, words);
        behind = await fellBehind(world, worker, frames, words);
    }
    await world.dispose();
    const reply = await seenBy(worker);
    await worker.terminate();
    frames.close();
    const { seen } = reply;
    return {
        runs: seen.length,
        wrong: seen.reduce((sum, run) => sum + run.wrong, 0),
        fewest: Math.min(...seen.map(run => run.rows)),
        most: Math.max(...seen.map(run => run.rows)),
        timers: reply.timers,
        partway,
        behind,
    };
};

/**
 * In chromium, with a GPU device: 100 rows a GPU kernel warms by 100 a run, and the worker's observer system counting
 * those at least 150 hot through a sorted index on what it writes, each count run by the worker before a warming run
 * whose sync point finds its post unclaimed, the worker holding: posted again after it, it's counted by the values the
 * kernel wrote. What each count gave.
 */
export const gpuLookups = async (device: GPUDevice): Promise<readonly number[]> => {
    const world = createWorld({ [workers]: 0, [gpuDevice]: device });
    const worker = await joined(world);
    const words = new Int32Array(new SharedArrayBuffer(gateWords * 4));
    await world.run(spawnHeated);
    const counts: number[] = [];
    for (let k = 1; k <= 2; k++) {
        Atomics.store(words, holdWord, 0);
        const counted = worker.ask({ kind: "count hot", gate: words });
        await until(Observe.resource(world, phase), value => value >= k);
        await world.run(warm);
        Atomics.store(words, holdWord, 1);
        Atomics.notify(words, holdWord);
        const reply = await counted;
        counts.push(reply.kind === "counted" ? reply.hot : -1);
    }
    await world.dispose();
    await worker.terminate();
    return counts;
};
