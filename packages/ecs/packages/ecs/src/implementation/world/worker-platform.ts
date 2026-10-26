// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { MessagePort as NodeMessagePort, Worker as NodeWorker } from 'node:worker_threads';
import type { FromWorker, ToWorker } from './protocol.js';
import { createDeath, lentPort, serveLent, type Endpoint, type Lent, type Port } from './port.js';

/** A pool worker as the world's thread sees it. */
export type WorkerPort = Port<ToWorker, FromWorker>;

/** Where a pool's workers come from: the platform's own, or ones another thread lent. */
export type WorkerPlatform = {
    /** The pool size the `workers` resource's `null` resolves to. */
    readonly count: number;
    /** Starts a worker running `worker.js`, or returns null once there are no more to start. */
    readonly start: () => WorkerPort | null;
};

/** The pool size for a platform's hardware threads: one worker per thread but the world's. */
const countFor = (parallelism: number): number => Math.max(1, parallelism - 1);

const noTransfer: ArrayBuffer[] = [];

/** The worker's file beside this module's chunk, named apart from `new Worker(...)` so browser builds don't bundle it. */
const workerFile = "./worker.js";

const browserWorker = (): Worker => new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

/** A browser `Worker` as a port. Its death is an `error`, such as failing to load, or a message it can't read. */
export const browserPort = (worker: Worker): WorkerPort => {
    const death = createDeath();
    worker.onerror = event => death.die(new Error(`A world worker failed: ${event.message || "it couldn't load"}.`));
    worker.onmessageerror = () => death.die(new Error("A world worker sent a message that couldn't be read."));
    return {
        post: (message, transfer = noTransfer) => worker.postMessage(message, transfer),
        onMessage: handler => { worker.onmessage = (event: MessageEvent<FromWorker>) => handler(event.data); },
        onDeath: death.onDeath,
        terminate: async () => worker.terminate(),
    };
};

/** A node `worker_threads` worker as a port. Its death is an `error`, such as failing to load, or its exit. */
export const nodePort = (worker: NodeWorker): WorkerPort => {
    const death = createDeath();
    worker.on("error", error => death.die(new Error(`A world worker failed: ${error instanceof Error ? error.message : String(error)}`)));
    worker.on("messageerror", () => death.die(new Error("A world worker sent a message that couldn't be read.")));
    worker.on("exit", code => death.die(new Error(`A world worker exited with code ${code}.`)));
    return {
        post: (message, transfer = noTransfer) => worker.postMessage(message, transfer),
        onMessage: handler => { worker.on("message", handler); },
        onDeath: death.onDeath,
        terminate: async () => { await worker.terminate(); },
    };
};

/** `worker_threads` on node, loaded only there, so browser bundles never load it. */
const nodeThreads = () => globalThis.process?.getBuiltinModule?.("node:worker_threads") ?? null;

/**
 * The platform's workers, nested workers where the world is on a worker, or null where there are none: browser
 * workers where `Worker` exists, and `worker_threads` on node. Counts come from `navigator.hardwareConcurrency` or
 * `os.availableParallelism()`.
 */
export const platformWorkers = (): WorkerPlatform | null => {
    if (typeof Worker === "function") {
        return { count: countFor(globalThis.navigator?.hardwareConcurrency ?? 2), start: () => browserPort(browserWorker()) };
    }
    const threads = nodeThreads();
    if (threads === null) return null;
    const parallelism = globalThis.process.getBuiltinModule("node:os").availableParallelism();
    return { count: countFor(parallelism), start: () => nodePort(new threads.Worker(new URL(workerFile, import.meta.url))) };
};

/** Workers another thread lent, each started once: the pool takes as many as there are. */
export const lentWorkers = (lent: readonly Lent[]): WorkerPlatform => {
    let next = 0;
    return { count: lent.length, start: () => next < lent.length ? lentPort<ToWorker, FromWorker>(lent[next++]) : null };
};

/** A worker lent to another thread: what to transfer there, in the platform's `MessagePort`s, and ending it from here. */
export type Lending<P extends Endpoint> = { readonly lent: Lent<P>; readonly terminate: () => Promise<void> };

/**
 * On the thread owning them: starts `count` workers to lend to a world on another thread, browser workers here. Each
 * gets the port it talks on before anything else; this thread keeps the worker, forwards its death to the world's thread
 * and ends it when asked. Post each `lent` there, transferring its two ports; there, `lentWorkers` makes them a platform.
 */
export const lendBrowserWorkers = (count: number): readonly Lending<MessagePort>[] => Array.from({ length: count }, () => {
    const worker = browserWorker();
    const data = new MessageChannel();
    const control = new MessageChannel();
    worker.postMessage({ kind: "port", port: data.port1 } satisfies ToWorker, [data.port1]);
    return { lent: { port: data.port2, owner: control.port2 }, terminate: serveLent(browserPort(worker), control.port1).terminate };
});

/** `lendBrowserWorkers` for node's `worker_threads`, or none where they're missing. */
export const lendNodeWorkers = (count: number): readonly Lending<NodeMessagePort>[] => {
    const threads = nodeThreads();
    if (threads === null) return [];
    return Array.from({ length: count }, () => {
        const worker = new threads.Worker(new URL(workerFile, import.meta.url));
        const data = new threads.MessageChannel();
        const control = new threads.MessageChannel();
        worker.postMessage({ kind: "port", port: data.port1 } satisfies ToWorker, [data.port1]);
        return { lent: { port: data.port2, owner: control.port2 }, terminate: serveLent(nodePort(worker), control.port1).terminate };
    });
};
