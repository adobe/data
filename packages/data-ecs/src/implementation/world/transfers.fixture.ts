/// <reference types="node" />
import { Observe } from "../../interface/observe/observe.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, type CreatedWorld } from "./create.js";
import type { FromTransfersWorker, ToTransfersWorker } from "./transfers-worker.fixture.js";
import { idle, kept, marks, order, stored } from "./transfers.test-helper.js";

/**
 * Scenarios of transfers between joined workers, run built in node and from source in chromium: the world here, a
 * filler worker claiming "transfersTest" and a loader worker claiming nothing, which moves runs' Transferable input to
 * the threads their systems run on.
 */

type Worker = { readonly ask: (message: ToTransfersWorker, transfer?: readonly unknown[]) => Promise<FromTransfersWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./transfers-worker.fixture.js";

const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./transfers-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromTransfersWorker>) => resolve(event.data);
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            worker.once("message", resolve);
            worker.postMessage(message, transfer.filter(port => port instanceof threads.MessagePort));
        }),
        terminate: async () => { await worker.terminate(); },
    };
};

/** A port of a channel this world shares the other end of. */
const shared = (world: CreatedWorld) => {
    if (typeof globalThis.Worker === "function") {
        const { port1, port2 } = new MessageChannel();
        world.share(port1);
        return port2;
    }
    const { port1, port2 } = new (globalThis.process.getBuiltinModule("node:worker_threads").MessageChannel)();
    world.share(port1);
    return port2;
};

/** The world, its filler and its loader, each with a channel to the other. */
const joined = async () => {
    stored.length = marks.length = kept.length = 0;
    const world = createWorld({ [workers]: 0 });
    const filler = start();
    const loader = start();
    const loaderPort = shared(world);
    const fillerPort = shared(world);
    await Promise.all([
        loader.ask({ kind: "join", port: loaderPort, threads: [] }, [loaderPort]),
        filler.ask({ kind: "join", port: fillerPort, threads: ["transfersTest"] }, [fillerPort]),
    ]);
    const end = async (): Promise<void> => {
        await world.dispose();
        await Promise.all([filler.terminate(), loader.terminate()]);
    };
    return { world, filler, loader, end };
};

const storedOf = async (worker: Worker) => {
    const reply = await worker.ask({ kind: "stored" });
    if (reply.kind !== "stored") throw new Error("transfers: the filler didn't say what it stored.");
    return reply;
};

/** The loader moving `count` buffers of `bytes` each, and a MessagePort, to the filler, whose systems take them. */
export const moves = async (count: number, bytes: number) => {
    const { filler, loader, end } = await joined();
    const moved = await loader.ask({ kind: "moves", count, bytes });
    const { stored: received } = await storedOf(filler);
    await end();
    return { moved, received };
};

/**
 * The loader's run moving a buffer to the filler while the filler's event loop is blocked for `milliseconds`, then
 * three runs of a system on the world's thread: what the world's own run took meanwhile, the order while the filler
 * was blocked, and the order each of the loader's runs saw once it wasn't.
 */
export const late = async (milliseconds: number) => {
    const { world, filler, loader, end } = await joined();
    await filler.ask({ kind: "block", milliseconds });
    const posted = await loader.ask({ kind: "late" });
    const begin = performance.now();
    await world.run(idle);
    const worldRun = performance.now() - begin;
    await new Promise(resolve => setTimeout(resolve, milliseconds / 4));
    const orderWhileBlocked = await Observe.toPromise(world.observe.resource(order));
    const settled = await loader.ask({ kind: "settled" });
    const { stored: received } = await storedOf(filler);
    await end();
    return { posted, worldRun, orderWhileBlocked, settled, stores: received.map(([, , seen]) => seen), marks: marks.map(({ value, order }) => [value, order]) };
};

/** Commands giving values the loader moved to a dead entity, on the filler and here: each released on its thread. */
export const drops = async () => {
    const { filler, loader, end } = await joined();
    const dropped = await loader.ask({ kind: "drops" });
    const { widths } = await storedOf(filler);
    const here = kept.map(value => typeof ImageBitmap === "function" && value instanceof ImageBitmap ? value.width : -1);
    await end();
    return { dropped, there: widths, here };
};
