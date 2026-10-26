// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import type { ToWorker } from './protocol.js';
import { browserPort, nodePort, platformWorkers, type WorkerPlatform, type WorkerPort } from './worker-platform.js';

/** The platform's workers, counting what the world does with them: workers started and ended, and messages by kind. */
export type Counting = {
    readonly platform: WorkerPlatform;
    /** Every port started, in order. */
    readonly ports: readonly WorkerPort[];
    readonly started: () => number;
    readonly terminated: () => number;
    /** Messages of this kind posted to any worker so far. */
    readonly posted: (kind: ToWorker["kind"]) => number;
    /** Completions so far whose task wrote past its command ring's size. */
    readonly spilled: () => number;
};

export const countingWorkers = (base: WorkerPlatform | null = platformWorkers()): Counting => {
    if (base === null) throw new Error("This platform has no workers.");
    const ports: WorkerPort[] = [];
    const posted = new Map<ToWorker["kind"], number>();
    let terminated = 0;
    let spilled = 0;
    const start = (): WorkerPort | null => {
        const port = base.start();
        if (port === null) return null;
        const counted: WorkerPort = {
            ...port,
            post: (message, transfer) => {
                posted.set(message.kind, (posted.get(message.kind) ?? 0) + 1);
                port.post(message, transfer);
            },
            onMessage: handler => port.onMessage(message => {
                if (message.kind !== "tables" && message.spill !== null) spilled++;
                handler(message);
            }),
            terminate: () => {
                terminated++;
                return port.terminate();
            },
        };
        ports.push(counted);
        return counted;
    };
    return {
        platform: { count: base.count, start },
        ports,
        started: () => ports.length,
        terminated: () => terminated,
        posted: kind => posted.get(kind) ?? 0,
        spilled: () => spilled,
    };
};

/** `count` of the platform's workers. */
export const startWorkers = (count: number, platform: WorkerPlatform | null = platformWorkers()): WorkerPort[] => Array.from({ length: count }, () => {
    const port = platform?.start() ?? null;
    if (port === null) throw new Error("This platform has no workers.");
    return port;
});

/** A worker whose script doesn't exist, so it fails to load. */
export const missingWorker = (): WorkerPort => {
    if (typeof Worker === "function") return browserPort(new Worker("/@missing/worker.js", { type: "module" }));
    const threads = globalThis.process.getBuiltinModule("node:worker_threads");
    return nodePort(new threads.Worker(new URL("./missing-worker.js", import.meta.url)));
};
