/// <reference types="node" />
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type CreatedWorld } from "./create.js";
import type { FromContainedWorker, ToContainedWorker } from "./synced-contained-worker.fixture.js";
import { bump, gateWords, nothing, reachedWord, releasedWord, setHolding } from "./synced-contained.test-helper.js";

/**
 * A joined worker's synced system reading only resources, held partway through a run while the world runs on: what
 * the world's runs do meanwhile, and what the worker's runs saw once released. Run built in node, from source in chromium.
 */

type Worker = { readonly ask: (message: ToContainedWorker, transfer?: readonly unknown[]) => Promise<FromContainedWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./synced-contained-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./synced-contained-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromContainedWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromContainedWorker): void => {
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

const later = (milliseconds = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

const joined = async (world: CreatedWorld): Promise<Worker> => {
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    for (let turn = 0; turn < 2000; turn++) {
        let status = "";
        world.threads(progress => { status = progress.at(-1)?.status ?? ""; })();
        if (status === "joined") break;
        await later();
    }
    return worker;
};

/**
 * Whether `work` settled while the worker still held its run, which only this thread releases: true once it settles,
 * and never for one waiting on the held worker, which times the test out.
 */
const settles = async (words: Int32Array, value: number, work: Promise<unknown>): Promise<boolean> => {
    await work;
    return Atomics.load(words, releasedWord) < value;
};

/** Resolves once the held run reached `value`. */
const reached = async (words: Int32Array, value: number): Promise<void> => {
    while (Atomics.load(words, reachedWord) < value) await later(1);
};

const release = (words: Int32Array, value: number): void => {
    Atomics.store(words, releasedWord, value);
    Atomics.notify(words, releasedWord);
};

/**
 * What the worker saw once it's seen `count` values: a post no later sync point replaces runs however late the thread
 * claims it, so this waits as long as that takes.
 */
const seenOnce = async (worker: Worker, count: number): Promise<readonly number[]> => {
    for (;;) {
        const reply = await worker.ask({ kind: "seen" });
        const tallies = reply.kind === "seen" ? reply.tallies : [];
        if (tallies.length >= count) {
            // A few more turns, for a run that shouldn't come to show it didn't.
            await later(50);
            const again = await worker.ask({ kind: "seen" });
            return again.kind === "seen" ? again.tallies : [];
        }
        await later(5);
    }
};

/**
 * Once the watcher ran for the tally's first value, 0, it holds its run of 1 while the world runs twice, changing
 * nothing it filters on; released, what it saw. Then it holds its run of 2 while the world bumps the tally twice more;
 * released, what it saw then. And whether the world's runs settled while it held each time.
 */
export const heldWhileTheWorldRuns = async () => {
    const world = createWorld({ [workers]: 0 });
    const worker = await joined(world);
    const words = new Int32Array(new SharedArrayBuffer(gateWords * 4));
    // Its first run, which passes its filter, before any is held: posted at the sync point of the worker's run, and run
    // before the world's next, which would replace it unclaimed.
    await worker.ask({ kind: "add", gate: words });
    await seenOnce(worker, 1);
    await world.run(setHolding, { holding: -1 });
    await world.run(bump);
    await reached(words, 1);
    const quiet = await settles(words, 1, Promise.all([world.run(nothing), world.run(setHolding, { holding: -1 })]));
    release(words, 1);
    const first = await seenOnce(worker, 2);
    await world.run(bump);
    await reached(words, 2);
    const bumped = await settles(words, 2, Promise.all([world.run(bump), world.run(bump)]));
    // Through the newest: the run it holds, and the one after, which holds once it reached it.
    release(words, 4);
    const second = await seenOnce(worker, 4);
    await world.dispose();
    await worker.terminate();
    return { quiet, first, bumped, second };
};
