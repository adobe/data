// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Worker-thread bootstrap for the Node persistence runtime. Spawned by
// {@link createNodeWorkerTransport}. The script:
//
//   1. Reads the backend root path from `workerData`.
//   2. Constructs a {@link createNodeFsBackend} rooted there.
//   3. Constructs a {@link createPersistRouter} over that backend.
//   4. Listens for `PersistOp` messages on `parentPort`, dispatches
//      each through the router, and posts back an `AckMessage`.
//
// The bootstrap intentionally has no domain knowledge: every semantic
// decision (which file to write, how to encode bytes) is made on the
// ECS thread before the op is posted. This keeps the worker side a
// dumb byte router and means the protocol is the only contract that
// has to remain stable between the two sides.

import { parentPort, workerData } from "node:worker_threads";
import { createNodeFsBackend } from "./node-fs-backend.js";
import { createPersistRouter, type PersistRouter } from "../transport/router.js";
import type { AckMessage, PersistOp } from "../transport/transport.js";

interface BootstrapData {
    readonly root: string;
}

if (parentPort === null) {
    throw new Error("node-worker-bootstrap loaded outside a worker_threads context");
}

const port = parentPort;

/**
 * Validate `workerData` at the worker boundary, returning a typed
 * value. The runtime guard is necessary because `workerData` is
 * declared `any` by node:worker_threads, and we need a single,
 * documented place where unchecked input becomes a known shape.
 */
const readBootstrapData = (raw: unknown): BootstrapData => {
    if (typeof raw === "object" && raw !== null && "root" in raw) {
        const root = (raw as { root: unknown }).root;
        if (typeof root === "string") return { root };
    }
    throw new Error("node-worker-bootstrap: workerData.root is required and must be a string");
};
const data = readBootstrapData(workerData);

// Lazy-init the router because createNodeFsBackend is async (it stat()s
// the root). Top-level await would make this module a bundler-async
// node — see CLAUDE.md. Cache the promise so concurrent messages share
// the same backend handle.
let routerPromise: Promise<PersistRouter> | null = null;
const getRouter = (): Promise<PersistRouter> => {
    if (routerPromise === null) {
        routerPromise = createNodeFsBackend(data.root).then((backend) => createPersistRouter(backend));
    }
    return routerPromise;
};

const sendAck = (id: number, value: unknown, error?: string): void => {
    const ack: AckMessage = error === undefined
        ? { kind: "ack", id, value }
        : { kind: "ack", id, error };
    port.postMessage(ack);
};

// Serialize op handling so the parent's "send a sentinel and wait for
// its ack" flush strategy is correct. Without this, the runtime
// dispatcher can interleave router.handle() promises and an ack for a
// later op may arrive before earlier ops finish their I/O.
let opChain: Promise<unknown> = Promise.resolve();
const handleSerially = (op: PersistOp): Promise<void> => {
    const next = opChain.then(async () => {
        try {
            const router = await getRouter();
            const value = await router.handle(op);
            sendAck(op.id, value);
        } catch (err) {
            sendAck(op.id, undefined, err instanceof Error ? err.message : String(err));
        }
    });
    opChain = next;
    return next;
};

/**
 * Inbound worker message: either a {@link PersistOp} from the parent
 * or a shutdown control message. Tagged unions across the message
 * boundary are how we narrow without an `as` cast.
 */
type InboundMessage = PersistOp | { readonly kind: "shutdown"; readonly id: number };

port.on("message", (msg: InboundMessage) => {
    if (msg.kind === "shutdown") {
        // Graceful shutdown: wait for the in-flight op chain to drain,
        // then close the router (releasing all open file handles), ack
        // the shutdown so the main thread knows the worker is safe to
        // terminate, then exit. The await on opChain is what makes
        // close()-after-flush() safe.
        const { id } = msg;
        const finish = async (): Promise<void> => {
            try {
                await opChain;
                if (routerPromise !== null) {
                    const r = await routerPromise;
                    await r.close();
                }
            } finally {
                sendAck(id, undefined);
                // Yield once so the postMessage actually flushes through
                // the libuv event loop before we exit. Without this,
                // the parent's flush sentinel race-loses on shutdown.
                setImmediate(() => process.exit(0));
            }
        };
        void finish();
        return;
    }
    void handleSerially(msg);
});
