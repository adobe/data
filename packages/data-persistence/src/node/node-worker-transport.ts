// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Worker, type TransferListItem } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import type { AckMessage, PersistMessage, PersistOp, Transport } from "../transport/transport.js";

/**
 * Configuration for {@link createNodeWorkerTransport}.
 */
export interface NodeWorkerTransportOptions {
    /**
     * Filesystem root used by the worker's NodeFsBackend. All
     * persistence-relative paths are resolved under this directory.
     */
    readonly root: string;
    /**
     * URL of the worker bootstrap script. Defaults to the built file
     * shipped with this package: `dist/node/node-worker-bootstrap.js`.
     *
     * Tests and bundled apps may override this when the bootstrap
     * lives at a non-standard location (e.g. a TypeScript source file
     * loaded via a TS-aware Node loader, or a re-bundled worker).
     */
    readonly workerScript?: URL;
}

/**
 * Resolve a sensible default URL for the worker bootstrap. Built
 * output places this file alongside the transport itself, so
 * `import.meta.url` plus the bare filename suffices in production.
 *
 * NOTE: in the source tree (e.g. when running Vitest against TS
 * sources directly), the `.js` file may not exist yet. In that case,
 * callers should pass an explicit `workerScript` URL pointing at the
 * built artifact or a TS-loader-aware entry.
 */
const defaultWorkerScript = (): URL => new URL("./node-worker-bootstrap.js", import.meta.url);

/**
 * Transport that runs the persistence router inside a `node:worker_threads`
 * Worker. Messages are framed as `PersistOp` -> `AckMessage`, with
 * ArrayBuffer payloads moved across via `transferList` for zero-copy
 * hand-off.
 */
export const createNodeWorkerTransport = (options: NodeWorkerTransportOptions): Transport => {
    const scriptUrl = options.workerScript ?? defaultWorkerScript();

    // node:worker_threads accepts URL or string. Convert file: URLs to
    // paths so the OS handler is consistent across platforms.
    const scriptPath = scriptUrl.protocol === "file:" ? fileURLToPath(scriptUrl) : scriptUrl;
    const worker = new Worker(scriptPath, {
        workerData: { root: options.root } satisfies { root: string },
    });

    const handlers = new Set<(msg: PersistMessage) => void>();
    // Map from op id → resolver for `request()` callers awaiting a
    // specific ack. `send()` callers do not register here; their
    // errors and values are surfaced via the message handlers.
    const pendingRequests = new Map<number, (msg: AckMessage) => void>();
    let closed = false;
    // Per-transport sentinel id sequence. Negative ids never collide
    // with operations submitted by the service layer (which uses
    // positive ids), so we share the pendingRequests map without an
    // extra namespace.
    let nextSentinelId = 1;

    worker.on("message", (msg: PersistMessage) => {
        if (msg.kind === "ack") {
            const resolver = pendingRequests.get(msg.id);
            if (resolver !== undefined) {
                pendingRequests.delete(msg.id);
                resolver(msg);
            }
        }
        for (const h of handlers) h(msg);
    });

    // Surface unexpected worker errors as unhandled rejections so they
    // are not silently swallowed. Production callers can install their
    // own `worker.on("error", ...)` upstream of this transport if they
    // need finer-grained control.
    worker.on("error", (err) => {
        queueMicrotask(() => {
            throw err;
        });
    });

    const transferListFor = (op: PersistOp): TransferListItem[] | undefined => {
        // Only the bytes-bearing ops have transferable payloads. Including
        // the buffer in transferList moves it without copy; otherwise the
        // structured clone algorithm copies. Note: node:worker_threads has
        // its own TransferListItem type, distinct from the DOM Transferable.
        if (op.kind === "writeColumnSlice" || op.kind === "appendJournal") {
            return [op.bytes];
        }
        return undefined;
    };

    return {
        send(op: PersistOp): void {
            if (closed) throw new Error("Transport is closed");
            const transferList = transferListFor(op);
            // worker_threads.postMessage signature differs from DOM:
            // 2nd arg is the transfer list directly.
            worker.postMessage(op, transferList);
        },
        request<T = unknown>(op: PersistOp): Promise<T> {
            if (closed) throw new Error("Transport is closed");
            return new Promise<T>((resolve, reject) => {
                pendingRequests.set(op.id, (msg) => {
                    if (msg.error !== undefined) reject(new Error(msg.error));
                    else resolve(msg.value as T);
                });
                const transferList = transferListFor(op);
                worker.postMessage(op, transferList);
            });
        },
        onMessage(handler) {
            handlers.add(handler);
            return () => handlers.delete(handler);
        },
        async flush(): Promise<void> {
            // Flush is a memory-fence: every send/request issued before
            // this call must have completed (acked or settled) before
            // it returns. With worker_threads + ordered postMessage,
            // pendingRequests is the only outstanding state we know
            // about. Wait for it to drain.
            //
            // Note: pure `send()` calls do not appear in pendingRequests
            // (they are fire-and-forget), so we drain by issuing a
            // sentinel `request()` and awaiting its ack — the worker
            // processes messages in receive order, so the sentinel ack
            // implies all prior sends were also handled.
            await new Promise<void>((resolve, reject) => {
                const id = -nextSentinelId;
                nextSentinelId += 1;
                pendingRequests.set(id, (msg) => {
                    if (msg.error !== undefined) reject(new Error(msg.error));
                    else resolve();
                });
                // Use a no-op listDir at root as the sentinel. The router
                // resolves it cheaply and never errors for an existing root.
                worker.postMessage({ id, kind: "listDir", path: "." } satisfies PersistOp);
            });
        },
        async close(): Promise<void> {
            if (closed) return;
            closed = true;
            // Graceful shutdown: ask the worker to drain its router
            // (closing all open fs handles) and wait for the ack
            // before terminating. We cap the wait so a wedged worker
            // can't hang close().
            const id = -nextSentinelId;
            nextSentinelId += 1;
            const ackPromise = new Promise<void>((resolve) => {
                pendingRequests.set(id, () => resolve());
            });
            try {
                worker.postMessage({ kind: "shutdown", id });
                await Promise.race([
                    ackPromise,
                    new Promise<void>((resolve) => setTimeout(resolve, 1000)),
                ]);
            } catch {
                // postMessage may throw if the worker is already gone.
            }
            handlers.clear();
            pendingRequests.clear();
            await worker.terminate();
        },
    };
};
