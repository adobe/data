/// <reference types="node" />
import type { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { workers } from "../../interface/resources/workers.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, type CreatedWorld } from "./create.js";
import { backToBack } from "./loop.js";
import type { FromSyncedWorker, ToSyncedWorker } from "./synced-joined-worker.fixture.js";
import { counter, seed, setStall, ticked } from "./synced-joined.test-helper.js";

/**
 * Scenarios of synced systems a joined worker adds, run built in node and from source in chromium: a system over
 * every row, and one looking every row up by entity, while the world ticks on writing them, prompt and stalling
 * partway so the world's next writer is ready before they finish.
 */

type Worker = { readonly ask: (message: ToSyncedWorker, transfer?: readonly unknown[]) => Promise<FromSyncedWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./synced-joined-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./synced-joined-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromSyncedWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromSyncedWorker): void => {
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

/** Ticks on until the counter passed `more` more. */
const ticks = async (world: World, more: number): Promise<void> => {
    const now = await until(world.observe.resource(counter), () => true);
    await until(world.observe.resource(counter), value => value >= now + more);
};

/**
 * 1,000 rows while the world ticks back to back writing them, the worker's synced system over them prompt, then
 * stalling partway, then prompt again: what each run saw, how many ran from a copy, and the ticks there were.
 */
export const continuous = async (system: "rows" | "lookups") => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const worker = await joined(world);
    await world.run(seed, { count: 1000 });
    world.add(ticked);
    await worker.ask({ kind: "add", system });
    await ticks(world, 30);
    await world.run(setStall, { pause: 3 });
    await ticks(world, 30);
    await world.run(setStall, { pause: 0 });
    await ticks(world, 10);
    const ticks_seen = await until(world.observe.resource(counter), () => true);
    await world.dispose();
    const reply = await worker.ask({ kind: "seen" });
    await worker.terminate();
    driver.close();
    if (reply.kind !== "seen") throw new Error("synced-joined: the worker didn't say what it saw.");
    const { seen } = reply;
    return {
        runs: seen.length,
        ticks: ticks_seen,
        wrong: seen.reduce((sum, run) => sum + run.wrong, 0),
        fewest: Math.min(...seen.map(run => run.rows)),
        most: Math.max(...seen.map(run => run.rows)),
        switched: reply.switched,
        late: reply.late,
        timers: reply.timers,
    };
};
