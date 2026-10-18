/// <reference types="node" />
import { threadClaims, threadStatus } from "../../interface/components/index.js";
import { Observe } from "../../interface/observe/observe.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join } from "./create.js";
import type { FromJoiningWorker, ToJoiningWorker } from "./joining-worker.fixture.js";
import { drive, names, total, until } from "./joining.test-helper.js";

/**
 * Scenarios of a thread joining a world on another, run built in node and from source in chromium: a worker joining a
 * world here, this thread joining a world on a worker, a joined worker that dies, and a thread claimed twice.
 */

/** A system only this thread imports, which a world on a worker never did. */
const unimportedByWorker = System.create({ name: "joiningTest/unimportedByWorker" }, () => {});

type Worker = { readonly ask: (message: ToJoiningWorker, transfer?: readonly unknown[]) => Promise<FromJoiningWorker>; readonly terminate: () => Promise<void> };

const workerFile = "./joining-worker.fixture.js";

/** Starts the joining worker, which answers each message with one. */
const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./joining-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromJoiningWorker>) => resolve(event.data);
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

const within = <T>(promise: Promise<T>, milliseconds: number, otherwise: T): Promise<T> =>
    Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(otherwise), milliseconds))]);

/** A world here, a worker joining it and driving it, then leaving. */
export const worldHere = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const thread = world.share(port1);
    const joined = until(world.observe.entity(thread, { required: [threadStatus, threadClaims] }), value => value?.[threadStatus] === "joined");
    const worker = start();
    const reply = await worker.ask({ kind: "join", port: port2, threads: ["main"] }, [port2]);
    const claims = (await joined)?.[threadClaims] ?? null;
    const gone = await until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === "gone");
    const result = {
        driven: reply.kind === "driven" ? reply.driven : null,
        claims,
        status: gone?.[threadStatus] ?? null,
        total: await Observe.toPromise(world.observe.resource(total)),
        names: await Observe.toPromise(world.observe.resource(names)),
    };
    await worker.terminate();
    await world.dispose();
    return result;
};

/** A world on a worker, this thread joining it and driving it, then leaving. */
export const worldThere = async () => {
    const worker = start();
    const { port1, port2 } = new MessageChannel();
    await worker.ask({ kind: "host", port: port1 }, [port1]);
    const remote = join(port2, { threads: ["main"] });
    const driven = await drive(remote, unimportedByWorker);
    await remote.dispose();
    const state = await worker.ask({ kind: "state" });
    await worker.terminate();
    return { driven, ...state.kind === "state" ? { total: state.total, names: state.names, status: state.status } : {} };
};

/** A worker that joined, then is ended from outside: its status, `"gone"` if the world heard of it. */
export const dies = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const thread = world.share(port1);
    const worker = start();
    const reply = await worker.ask({ kind: "idle", port: port2, threads: [] }, [port2]);
    await worker.terminate();
    const gone = await within(until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === "gone"), 5000, null);
    await world.dispose();
    return { ran: reply.kind === "joined" ? reply.ran : null, status: gone?.[threadStatus] ?? null };
};

/** Two workers claiming `main`: the second's run, and its status. */
export const claimedTwice = async () => {
    const world = createWorld({ [workers]: 0 });
    const first = new MessageChannel();
    const second = new MessageChannel();
    world.share(first.port1);
    const thread = world.share(second.port1);
    const pair = [start(), start()];
    const one = await pair[0].ask({ kind: "idle", port: first.port2, threads: ["main"] }, [first.port2]);
    const two = await pair[1].ask({ kind: "idle", port: second.port2, threads: ["main"] }, [second.port2]);
    const gone = await until(world.observe.entity(thread, { required: [threadStatus] }), value => value?.[threadStatus] === "gone");
    for (const worker of pair) await worker.terminate();
    await world.dispose();
    return { first: one.kind === "joined" ? one.ran : null, second: two.kind === "joined" ? two.ran : null, status: gone?.[threadStatus] ?? null };
};
