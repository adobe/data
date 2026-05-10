// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Worker bootstrap for the browser persistence runtime. Spawned by
// the application via `new Worker(new URL(...), { type: "module" })`
// and wrapped by {@link createBrowserWorkerTransport}.
//
// The script:
//
//   1. Acquires the OPFS root via `navigator.storage.getDirectory()`.
//   2. Constructs an {@link createOpfsBackend} over that root.
//   3. Constructs a {@link createPersistRouter}.
//   4. Listens for `PersistOp` messages on `self`, dispatches each
//      through the router, and posts back an `AckMessage`.
//
// The bootstrap runs entirely inside the worker and never touches the
// DOM. Sync access handles (used by OpfsSyncFile) are only available
// in dedicated workers — this module fails fast if loaded elsewhere.

/// <reference lib="webworker" />

import { createOpfsBackend } from "./opfs-backend.js";
import { createPersistRouter, type PersistRouter } from "../transport/router.js";
import type { AckMessage, PersistOp } from "../transport/transport.js";

declare const self: DedicatedWorkerGlobalScope;

const getOpfsRoot = async (): Promise<FileSystemDirectoryHandle> => {
    // `navigator.storage` is universally available in dedicated
    // workers in modern browsers, but we guard so a clear error
    // surfaces if the bootstrap is loaded in a context without it.
    const storage = navigator.storage;
    if (storage === undefined || typeof storage.getDirectory !== "function") {
        throw new Error("browser-worker-bootstrap: navigator.storage.getDirectory is unavailable in this worker");
    }
    return storage.getDirectory();
};

// Lazy-init: defer OPFS acquisition until the first message so the
// bootstrap can't deadlock at module load (and so the parent gets a
// crisp error if OPFS is unavailable, rather than a silent hang).
let routerPromise: Promise<PersistRouter> | null = null;
const getRouter = (): Promise<PersistRouter> => {
    if (routerPromise === null) {
        routerPromise = (async () => {
            const root = await getOpfsRoot();
            const backend = await createOpfsBackend(root);
            return createPersistRouter(backend);
        })();
    }
    return routerPromise;
};

const sendAck = (id: number, value: unknown, error?: string): void => {
    const ack: AckMessage = error === undefined
        ? { kind: "ack", id, value }
        : { kind: "ack", id, error };
    self.postMessage(ack);
};

// Serialize op handling so the parent's "send a sentinel and wait for
// its ack" flush strategy is correct. Without this, async dispatch
// interleaves router.handle() promises and the sentinel ack can race
// ahead of an earlier op still doing I/O.
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

self.addEventListener("message", (ev: MessageEvent<InboundMessage>) => {
    const msg = ev.data;
    if (msg.kind === "shutdown") {
        // Graceful: drain the in-flight op chain, close the router
        // (releasing all OPFS access handles), ack the shutdown, then
        // close the worker. The main thread waits for the ack before
        // calling worker.terminate() so it can rely on file releases
        // having happened.
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
                self.close();
            }
        };
        void finish();
        return;
    }
    void handleSerially(msg);
});
