// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { PersistenceBackend } from "../backend/persistence-backend.js";
import type { Transport } from "../transport/transport.js";

/**
 * Public-facing persistence service. Implements the same `save`/`load`
 * contract as `@adobe/data/ecs`'s `PersistenceService`, plus `flush`,
 * `checkpoint`, and `dispose` for orderly lifecycle management.
 *
 * Every method returns `Promise<void>` (AsyncDataService compatible).
 */
export interface IncrementalPersistenceService {
    readonly serviceName: string;
    save(): Promise<void>;
    load(): Promise<void>;
    /** Force a checkpoint regardless of cadence. */
    checkpoint(): Promise<void>;
    /**
     * Wait for all in-flight writes triggered by previously-observed
     * transactions to complete. Useful before reading the backend directly
     * and in tests.
     */
    flush(): Promise<void>;
    /** Stop observing, flush pending writes, and close the transport. */
    dispose(): Promise<void>;
}

/**
 * Options for `createIncrementalPersistenceService`.
 */
export interface IncrementalPersistenceServiceOptions {
    readonly database: Database<any, any, any, any, any, any, any, any>;
    /**
     * The backend to write to. Always required so that the runtime
     * selection (OPFS, node-fs, memory, cloud) is explicit at the call
     * site.
     */
    readonly backend: PersistenceBackend;
    /**
     * Transport between this service and the storage worker. Defaults to
     * an in-process transport over `backend`. Browser callers pass a
     * `BrowserWorkerTransport`; Node callers that want a worker pass a
     * `NodeWorkerTransport`.
     */
    readonly transport?: Transport;
    /**
     * Automatically persist every non-transient, non-ephemeral
     * transaction. Defaults to `true`.
     */
    readonly autoPersist?: boolean;
    readonly checkpoint?: {
        readonly everyNTransactions?: number;
        readonly idleMs?: number;
    };
    /** Test-only: monotonic timestamp source. */
    readonly clock?: () => number;
    /** Test-only: monotonic transaction-id source. */
    readonly txIdGenerator?: () => number;
}
