// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { PersistenceBackend } from "../backend/persistence-backend.js";
import type { Transport } from "../transport/transport.js";

/**
 * Public-facing service. Implements the same `save` / `load` contract
 * as `@adobe/data/ecs`'s `PersistenceService`, plus a `dispose` for
 * orderly transport shutdown.
 */
export interface WorkerPersistenceService {
    readonly serviceName: string;
    save(): Promise<void>;
    load(): Promise<void>;
    /** Force a checkpoint regardless of cadence. */
    checkpoint(): Promise<void>;
    /**
     * Wait for all in-flight writes triggered by previously-observed
     * transactions to complete. Useful for tests and for callers that
     * want a safe point before reading the backend directly.
     */
    flush(): Promise<void>;
    /** Tear down: stop observing, flush, close transport. */
    dispose(): Promise<void>;
}

export interface WorkerPersistenceServiceOptions {
    readonly database: Database<any, any, any, any, any, any, any, any>;
    /**
     * The backend to write to. The backend is constructed by the caller
     * so that runtime selection (OPFS, node-fs, memory) and root path
     * are explicit at the call site.
     */
    readonly backend: PersistenceBackend;
    /**
     * The transport between this service and the backend. Defaults to
     * an in-process transport over the same backend. Browser callers
     * pass a `BrowserWorkerTransport`; Node callers pass a
     * `NodeWorkerTransport`.
     *
     * NOTE: when using a worker transport, the worker side must
     * construct its own backend pointing at the same root.
     */
    readonly transport?: Transport;
    /**
     * If true, persist changes automatically on every non-transient,
     * non-ephemeral transaction. Defaults to true.
     */
    readonly autoPersist?: boolean;
    /**
     * Checkpoint cadence. The first condition that fires triggers a
     * checkpoint. Both default to enabled.
     */
    readonly checkpoint?: {
        readonly everyNTransactions?: number;
        readonly idleMs?: number;
    };
    /**
     * Test-only seam: monotonic timestamp source.
     */
    readonly clock?: () => number;
    /**
     * Test-only seam: monotonic transaction-id source.
     */
    readonly txIdGenerator?: () => number;
}
