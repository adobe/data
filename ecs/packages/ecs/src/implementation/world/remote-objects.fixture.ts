// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Observe } from "../../observe/index.js";
import { always } from "../../interface/resources/always.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { backToBack } from "./loop.js";
import type { FromRemoteObjectsWorker, ToRemoteObjectsWorker } from "./remote-objects-worker.fixture.js";
import { churn, seed, serial, type Observers, type Watched } from "./remote-objects.test-helper.js";

/**
 * Scenarios of objects a joined worker fills, run built in node and from source in chromium: the worker watches an
 * entity whose objects change and move every tick, while the world here applies sync points back to back.
 */

type Worker = { readonly ask: (message: ToRemoteObjectsWorker, transfer: readonly unknown[]) => Promise<FromRemoteObjectsWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./remote-objects-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./remote-objects-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromRemoteObjectsWorker>) => resolve(event.data);
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer) => new Promise(resolve => {
            worker.once("message", resolve);
            worker.postMessage(message, transfer.filter(port => port instanceof threads.MessagePort));
        }),
        terminate: async () => { await worker.terminate(); },
    };
};

/**
 * A worker watching an entity's objects here, through `observers`, while the world ticks back to back, moving and
 * changing them each tick.
 */
export const watchedWhileApplying = async (count: number, observers: Observers): Promise<Watched | null> => {
    const driver = backToBack();
    const world = createWorld({ [workers]: 0, [always]: true }, { loop: driver });
    await world.run(seed);
    const [entity] = await Observe.toPromise(Observe.select(world, { required: [serial], where: { [serial]: 0 } }));
    const worker = start();
    const { port1, port2 } = new MessageChannel();
    const shared = world.share(port1);
    world.add(churn);
    const reply = await worker.ask({ kind: "watch", port: port2, entity, count, observers }, [port2]);
    await shared;
    await worker.terminate();
    await world.dispose();
    driver.close();
    return reply.kind === "watched" ? reply.watched : null;
};
