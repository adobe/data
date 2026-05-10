// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { IncrementalPersistenceService } from "../service/incremental-persistence-service.js";

/**
 * Options common to all persistence provider mounts.
 */
export interface ProviderMountOptions {
    /**
     * Automatically persist every non-transient, non-ephemeral transaction.
     * Defaults to `true`.
     */
    readonly autoPersist?: boolean;
    /**
     * Checkpoint cadence. The first condition that fires triggers a checkpoint.
     */
    readonly checkpoint?: {
        readonly everyNTransactions?: number;
        readonly idleMs?: number;
    };
}

/**
 * A fully-wired persistence session returned by a `PersistenceProvider`.
 *
 * Obtained via `mount(provider, database, opts)`. Call `dispose()` to
 * tear everything down in the correct order — do not call
 * `service.dispose()` directly.
 */
export interface PersistenceMount {
    /** The ready-to-use persistence service. */
    readonly service: IncrementalPersistenceService;
    /**
     * Tear down the session: flushes in-flight writes, stops observers,
     * releases worker/file handles. After this resolves the mount is
     * unusable.
     */
    dispose(): Promise<void>;
}

/**
 * Pluggable persistence back-end.
 *
 * Implementers fall into two patterns:
 *
 * **Pattern A — byte-range storage** (OPFS, `node:fs`, byte-range capable
 * cloud): Implement `PersistenceBackend` + `RandomAccessFile` and build a
 * provider that wraps them with `createInprocessTransport` +
 * `createIncrementalPersistenceService`. Reuses the full journal/manifest
 * machinery.
 *
 * **Pattern B — whole-file storage** (object-storage blobs, cloud APIs
 * without byte-range support): Implement `PersistenceProvider` directly.
 * Override `mount()` to observe `database.observe.transactions`, accumulate
 * deltas, and push a complete blob on `flush`/`checkpoint`. The journal and
 * manifest logic are entirely provider-owned.
 */
export interface PersistenceProvider {
    /** Human-readable identifier used in diagnostics. */
    readonly providerName: string;
    /**
     * Build a fully-wired persistence mount for `database`. The returned
     * `PersistenceMount` owns the full lifecycle; call `mount.dispose()`
     * when done.
     */
    mount(
        database: Database<any, any, any, any, any, any, any, any>,
        options?: ProviderMountOptions,
    ): Promise<PersistenceMount>;
}
