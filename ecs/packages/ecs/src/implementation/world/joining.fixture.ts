// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { Observe } from "../../observe/index.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { createWorld, join } from "./create.js";
import type { FromJoiningWorker, ToJoiningWorker } from "./joining-worker.fixture.js";
import { add, drive, idle, names, shelf, total, until } from "./joining.test-helper.js";

/**
 * Scenarios of a thread joining a world on another, run built in node and from source in chromium: a worker joining a
 * world here, this thread joining a world on a worker, a joined worker that dies, and a thread claimed twice.
 */

/** A system only this thread imports, which a world on a worker never did. */
const unimportedByWorker = System.create({}, () => {});
/** An observer system only this thread imports, reading an object of `main`, so it's placed on a thread claiming it. */
const shelvedHere = System.create({ readonly: true }, ({ resources }) => resources[shelf].length);

type Worker = {
    readonly ask: (message: ToJoiningWorker, transfer?: readonly unknown[]) => Promise<FromJoiningWorker>;
    readonly terminate: () => Promise<void>;
    /** The worker itself, as a port to join a world it shares through its scope. */
    readonly port: Parameters<World["share"]>[0];
};

/** Whether a reply is the fixture's, not the world's, where it shares the worker's scope. */
const isReply = (data: unknown): boolean => typeof data === "object" && data !== null && !("protocol" in data);

const workerFile = "./joining-worker.fixture.js";

/** Starts the joining worker, which answers each message with one. */
const start = (): Worker => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./joining-worker.fixture.js", import.meta.url), { type: "module" });
        return {
            ask: (message, transfer = []) => new Promise(resolve => {
                worker.onmessage = (event: MessageEvent<FromJoiningWorker>) => { if (isReply(event.data)) resolve(event.data); };
                worker.postMessage(message, { transfer: transfer.filter(port => port instanceof MessagePort) });
            }),
            terminate: async () => worker.terminate(),
            port: worker,
        };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL(workerFile, import.meta.url));
    return {
        ask: (message, transfer = []) => new Promise(resolve => {
            const reply = (data: FromJoiningWorker): void => {
                if (!isReply(data)) return;
                worker.off("message", reply);
                resolve(data);
            };
            worker.on("message", reply);
            worker.postMessage(message, transfer.filter(port => port instanceof threads.MessagePort));
        }),
        terminate: async () => { await worker.terminate(); },
        port: worker,
    };
};

/** Starts a worker that fails as it starts: it, as a port, and how to end it. */
const startFailing = (): Pick<Worker, "port" | "terminate"> => {
    if (typeof globalThis.Worker === "function") {
        const worker = new globalThis.Worker(new URL("./failing-worker.fixture.js", import.meta.url), { type: "module" });
        return { port: worker, terminate: async () => worker.terminate() };
    }
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    const worker = new threads.Worker(new URL("./failing-worker.fixture.js", import.meta.url));
    return { port: worker, terminate: async () => { await worker.terminate(); } };
};

const within = <T>(promise: Promise<T>, milliseconds: number, otherwise: T): Promise<T> =>
    Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(otherwise), milliseconds))]);

/** `"joined"` once a share or join resolved, or the message it rejected with. */
const outcomeOf = (promise: Promise<unknown>): Promise<string> => promise.then(() => "joined", (error: unknown) => error instanceof Error ? error.message : String(error));

/** A world here, a worker joining it and driving it, then leaving. */
export const worldHere = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const shared = world.share(port1);
    const worker = start();
    const reply = await worker.ask({ kind: "join", port: port2, threads: ["main"] }, [port2]);
    await shared;
    const claims = (await until(world.threads, threads => threads[0] !== undefined))[0]?.claims ?? null;
    const gone = (await until(world.threads, threads => threads[0]?.status === "gone"))[0];
    const result = {
        driven: reply.kind === "driven" ? reply.driven : null,
        claims,
        status: gone?.status ?? null,
        total: await Observe.toPromise(Observe.resource(world, total)),
        names: await Observe.toPromise(Observe.resource(world, names)),
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
    const remote = await join(port2, { threads: ["main"] });
    const driven = await drive(remote, unimportedByWorker);
    await remote.dispose();
    const state = await worker.ask({ kind: "state", driven });
    await worker.terminate();
    return state.kind === "state" ? { driven: state.driven, total: state.total, names: state.names, status: state.status } : { driven: null };
};

/** A worker that joined, then is ended from outside: its status, `"gone"` if the world heard of it. */
export const dies = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const shared = outcomeOf(world.share(port1));
    const worker = start();
    const reply = await worker.ask({ kind: "idle", port: port2, threads: [] }, [port2]);
    const share = await shared;
    await worker.terminate();
    const gone = await within(until(world.threads, threads => threads[0]?.status === "gone"), 20000, null);
    await world.dispose();
    return { ran: reply.kind === "joined" ? reply.ran : null, share, status: gone?.[0]?.status ?? null };
};

/** Two workers claiming `main`: each side's outcome of the second's join, the first's run, and the second's status. */
export const claimedTwice = async () => {
    const world = createWorld({ [workers]: 0 });
    const first = new MessageChannel();
    const second = new MessageChannel();
    const shares = [outcomeOf(world.share(first.port1)), outcomeOf(world.share(second.port1))];
    const pair = [start(), start()];
    const one = await pair[0].ask({ kind: "idle", port: first.port2, threads: ["main"] }, [first.port2]);
    const two = await pair[1].ask({ kind: "idle", port: second.port2, threads: ["main"] }, [second.port2]);
    const gone = (await until(world.threads, threads => threads[1]?.status === "gone"))[1];
    const shared = await Promise.all(shares);
    for (const worker of pair) await worker.terminate();
    await world.dispose();
    return { first: one.kind === "joined" ? one.ran : null, second: two.kind === "joined" ? two.ran : null, shared, status: gone?.status ?? null };
};

/**
 * A world here, a worker joining it and adding an observer system as its join resolved: once `share` resolved, a run
 * from this thread reaches it. What the worker's join and the world's share gave, and what the observer system heard.
 */
export const signal = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const shared = outcomeOf(world.share(port1));
    const worker = start();
    const listening = worker.ask({ kind: "listen", port: port2, threads: ["main"] }, [port2]);
    const share = await shared;
    await world.run(add, { amount: 7 });
    const reply = await listening;
    const heard = await worker.ask({ kind: "heard", value: 7 });
    await worker.terminate();
    await world.dispose();
    return { share, joined: reply.kind === "listening" ? reply.joined : null, heard: heard.kind === "heard" ? heard.heard : null };
};

/**
 * A worker that ends on the turn its join resolved, so the world never hears its join finished: what the world's
 * share gave, and whether another thread then claims what it claimed.
 */
export const diesJoining = async () => {
    const world = createWorld({ [workers]: 0 });
    const first = new MessageChannel();
    const shared = within(outcomeOf(world.share(first.port1)), 20000, "pending");
    const worker = start();
    // Never answered: the worker ends.
    void worker.ask({ kind: "exit on join", port: first.port2, threads: ["main"] }, [first.port2]);
    const share = await shared;
    const second = new MessageChannel();
    const again = outcomeOf(world.share(second.port1));
    const remote = await join(second.port2, { threads: ["main"] });
    const result = { share, again: await again };
    await remote.dispose();
    await worker.terminate();
    await world.dispose();
    return result;
};

/**
 * A worker claiming `main`, then a run here of an observer system reading `main`'s objects that the worker never
 * imported: what the run gave, and whether the world still runs and disposes.
 */
export const unimportedObserver = async () => {
    const world = createWorld({ [workers]: 0 });
    const { port1, port2 } = new MessageChannel();
    const shared = world.share(port1);
    const worker = start();
    await worker.ask({ kind: "idle", port: port2, threads: ["main"] }, [port2]);
    await shared;
    const ran = await within(outcomeOf(world.run(shelvedHere)), 10000, "pending");
    const after = await within(outcomeOf(world.run(idle)), 10000, "pending");
    const disposed = await within(outcomeOf(world.dispose()), 10000, "pending");
    await worker.terminate();
    return { ran, after, disposed };
};

/** A share with a worker, and a join through another, each failing as it starts: what each gave. */
export const failingWorkers = async () => {
    const world = createWorld({ [workers]: 0 });
    const sharedWith = startFailing();
    const shared = await within(outcomeOf(world.share(sharedWith.port)), 20000, "pending");
    const joinedThrough = startFailing();
    const joined = await within(outcomeOf(join(joinedThrough.port)), 20000, "pending");
    await sharedWith.terminate();
    await joinedThrough.terminate();
    await world.dispose();
    return { shared, joined };
};

/** This thread joining a world on a worker that stalls before it answers, then is ended: what the join gave. */
export const worldDies = async () => {
    const worker = start();
    const { port1, port2 } = new MessageChannel();
    await worker.ask({ kind: "host and stall", port: port1 }, [port1]);
    const joining = within(outcomeOf(join(port2)), 20000, "pending");
    await worker.terminate();
    return await joining;
};

/** A world on a worker shared through its own scope, this thread joined through the worker: runs, an observer factory, leaving. */
export const scopes = async () => {
    const worker = start();
    await worker.ask({ kind: "host scope" });
    const remote = await join(worker.port);
    for (const amount of [4, 5, 6]) await remote.run(add, { amount });
    const observed = await until(Observe.resource(remote, total), value => value === 456);
    await remote.dispose();
    const state = await worker.ask({ kind: "state" });
    await worker.terminate();
    return { observed, ...state.kind === "state" ? { total: state.total, status: state.status } : {} };
};
