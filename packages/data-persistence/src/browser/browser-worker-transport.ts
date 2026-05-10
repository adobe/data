// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { AckMessage, PersistMessage, PersistOp, Transport } from "../transport/transport.js";

/**
 * Configuration for {@link createBrowserWorkerTransport}. The worker
 * is constructed by the caller — bundlers (Vite, webpack, esbuild,
 * Rolldown) all support `new Worker(new URL("./entry.js", import.meta.url), ...)`
 * and need that pattern present in user code to discover the worker
 * entry. Passing the worker in keeps this transport bundler-agnostic.
 *
 * Example (Vite):
 *
 * ```ts
 * import workerUrl from "@adobe/data-persistence/browser-worker?url";
 * const worker = new Worker(workerUrl, { type: "module" });
 * const transport = createBrowserWorkerTransport({ worker });
 * ```
 */
export interface BrowserWorkerTransportOptions {
    readonly worker: Worker;
    /**
     * If true, calling `transport.close()` also calls `worker.terminate()`.
     * Defaults to true. Set to false when the same worker is shared
     * across multiple consumers.
     */
    readonly terminateOnClose?: boolean;
}

/**
 * Transport that frames the persistence protocol over a DOM Worker.
 * The worker side must run the bootstrap from this package
 * (`@adobe/data-persistence/browser-worker`). Bytes-bearing ops
 * transfer their ArrayBuffer payloads via the postMessage transfer
 * list for zero-copy hand-off.
 */
export const createBrowserWorkerTransport = (
    options: BrowserWorkerTransportOptions,
): Transport => {
    const { worker, terminateOnClose = true } = options;

    const handlers = new Set<(msg: PersistMessage) => void>();
    const pendingRequests = new Map<number, (msg: AckMessage) => void>();
    let closed = false;
    let nextSentinelId = 1;

    worker.addEventListener("message", (ev: MessageEvent<PersistMessage>) => {
        const msg = ev.data;
        if (msg.kind === "ack") {
            const resolver = pendingRequests.get(msg.id);
            if (resolver !== undefined) {
                pendingRequests.delete(msg.id);
                resolver(msg);
            }
        }
        for (const h of handlers) h(msg);
    });

    worker.addEventListener("error", (ev: ErrorEvent) => {
        // Surface unexpected worker errors as unhandled rejections so they
        // don't get silently swallowed.
        queueMicrotask(() => {
            throw ev.error ?? new Error(ev.message);
        });
    });

    const transferListFor = (op: PersistOp): Transferable[] => {
        if (op.kind === "writeColumnSlice" || op.kind === "appendJournal") {
            return [op.bytes];
        }
        return [];
    };

    // The Transport interface accepts `readonly Transferable[]`, but
    // Worker.postMessage requires a mutable `Transferable[]`. Copy
    // (cheap; usually 0 or 1 element) instead of casting.
    const toMutableTransfer = (list: readonly Transferable[] | undefined, op: PersistOp): Transferable[] =>
        list === undefined ? transferListFor(op) : [...list];

    return {
        send(op: PersistOp, transfer?: readonly Transferable[]): void {
            if (closed) throw new Error("Transport is closed");
            worker.postMessage(op, toMutableTransfer(transfer, op));
        },
        request<T = unknown>(op: PersistOp, transfer?: readonly Transferable[]): Promise<T> {
            if (closed) throw new Error("Transport is closed");
            return new Promise<T>((resolve, reject) => {
                // The transport's request<T>() generic is a contract
                // with the caller about the expected reply payload;
                // there is no way to verify it at runtime, so the
                // reply is `unknown` until the caller asserts.
                pendingRequests.set(op.id, (msg) => {
                    if (msg.error !== undefined) reject(new Error(msg.error));
                    else resolve(msg.value as T);
                });
                worker.postMessage(op, toMutableTransfer(transfer, op));
            });
        },
        onMessage(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
        async flush(): Promise<void> {
            // See node-worker-transport for the sentinel rationale: the
            // worker processes messages in receive order, so an acked
            // sentinel implies all earlier sends were also handled.
            await new Promise<void>((resolve, reject) => {
                const id = -nextSentinelId;
                nextSentinelId += 1;
                pendingRequests.set(id, (msg) => {
                    if (msg.error !== undefined) reject(new Error(msg.error));
                    else resolve();
                });
                worker.postMessage({ id, kind: "listDir", path: "." } satisfies PersistOp);
            });
        },
        async close(): Promise<void> {
            if (closed) return;
            closed = true;
            // Graceful shutdown: ask the worker to close its router
            // (which releases all OPFS sync access handles) and wait
            // for its ack before terminating. Without this wait, OPFS
            // can still report "Access Handles cannot be created" on
            // the next test/run because file releases are not yet
            // visible to the next worker.
            const id = -nextSentinelId;
            nextSentinelId += 1;
            const ackPromise = new Promise<void>((resolve) => {
                pendingRequests.set(id, () => resolve());
            });
            try {
                worker.postMessage({ kind: "shutdown", id });
                // Cap the wait so a wedged worker can't hang close().
                await Promise.race([
                    ackPromise,
                    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
                ]);
            } catch {
                // postMessage may throw if the worker is already gone.
            }
            handlers.clear();
            pendingRequests.clear();
            if (terminateOnClose) worker.terminate();
        },
    };
};
