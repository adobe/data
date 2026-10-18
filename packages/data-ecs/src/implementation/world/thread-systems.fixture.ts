/// <reference types="node" />
import { threadStatus } from "../../interface/components/index.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../interface/observe/observe.js";
import { always } from "../../interface/resources/always.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld } from "./create.js";
import { backToBack } from "./loop.js";
import type { FromThreadSystemsWorker, ToThreadSystemsWorker } from "./thread-systems-worker.fixture.js";
import { caption, changes, count, countThere, scenario, stall } from "./thread-systems.test-helper.js";

/**
 * Scenarios of systems on a joined worker, run built in node and from source in chromium: the same runs as an inline
 * world's, a worker that dies mid-task, one that never imported a system placed on it, and one that never yields.
 */

/** A system on the worker's thread, which only this module declares, so the worker never imported it. */
const onlyHere = System.create({ name: "threadSystemsTest/onlyHere", components: { read: [caption] } }, row => { void row[caption]; });

type Worker = { readonly ask: (message: ToThreadSystemsWorker, transfer?: readonly unknown[]) => Promise<FromThreadSystemsWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./thread-systems-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./thread-systems-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromThreadSystemsWorker>) => { if (!("protocol" in event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromThreadSystemsWorker): void => {
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

/** The first value an observer gives that `accept` takes. */
const until = <T>(observe: Observe<T>, accept: (value: T) => boolean): Promise<T> => new Promise(resolve => {
    let done = false;
    const stop = observe(value => {
        if (done || !accept(value)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve(value);
    });
});

const within = <T>(promise: Promise<T>, milliseconds: number, otherwise: T): Promise<T> =>
    Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(otherwise), milliseconds))]);

/** A world shared with a worker that joins it claiming "threadSystemsTest", once it joined. */
const joined = async (world: World): Promise<{ readonly worker: Worker; readonly thread: Entity }> => {
    const { port1, port2 } = new MessageChannel();
    const thread = world.share(port1);
    const worker = start();
    await worker.ask({ kind: "join", port: port2 }, [port2]);
    await until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === "joined");
    return { worker, thread };
};

/** The scenario's results, inline and with the joined worker running the systems on its thread. */
export const sameResults = async () => {
    const inline = createWorld({ [workers]: 0 });
    const expected = await scenario(inline);
    await inline.dispose();
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    const actual = await scenario(world, async entities => {
        const reply = await worker.ask({ kind: "objects", entities });
        return reply.kind === "objects" ? reply.objects : [];
    });
    await worker.terminate();
    await world.dispose();
    return { expected, actual };
};

/** A run whose system on the worker never finishes, while the worker is ended from outside: its report. */
export const diesMidTask = async () => {
    const world = createWorld({ [workers]: 0 });
    const { worker } = await joined(world);
    const running = world.run(stall);
    await new Promise(resolve => setTimeout(resolve, 50));
    await worker.terminate();
    const report = await within(running, 5000, null);
    // Placed here again once its claims are released: a run on the world's thread.
    const after = report === null ? null : await within(world.run(count), 5000, null);
    await world.dispose();
    return {
        report: report === null ? null : { failures: report.failures.map(failure => [failure.kind, failure.name, failure.message]), skipped: report.skipped },
        after: after === null ? null : after.failures.length,
    };
};

/** A worker claiming the thread of a system it never imported: why its run rejects. */
export const unimported = async () => {
    const world = createWorld({ [workers]: 0 });
    await world.run(onlyHere);
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = start();
    const reply = await worker.ask({ kind: "refused", port: port2 }, [port2]);
    await worker.terminate();
    await world.dispose();
    return reply.kind === "refused" ? reply.message : null;
};

/** Ticks of a world-only system, back to back, while the joined worker claiming a thread never yields: how many ran. */
export const neverYields = async (ticks: number) => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const { worker } = await joined(world);
    await worker.ask({ kind: "spin" });
    world.add(count);
    const counted = await within(until(world.observe.resource(changes), value => value >= ticks), 10000, -1);
    await worker.terminate();
    await world.dispose();
    driver.close();
    return counted;
};

/**
 * Ticks of a system on the joined worker, back to back, each a task that follows the last closely: how many ran, or -1
 * once they stopped, as when a wake notified no one.
 */
export const ticksThere = async (ticks: number) => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    const { worker } = await joined(world);
    world.add(countThere);
    const counted = await within(until(world.observe.resource(changes), value => value >= ticks), 10000, -1);
    await worker.terminate();
    await world.dispose();
    driver.close();
    return counted;
};
