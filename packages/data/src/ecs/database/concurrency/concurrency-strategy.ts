// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import type { TransactionContext, TransactionResult } from "../transactional-store/index.js";
import type { TransactionEnvelope } from "../reconciling/reconciling-database.js";

/**
 * The interface every concurrency strategy must satisfy.
 *
 * A strategy encapsulates all decisions about how locally-initiated
 * transactions are applied and how inbound envelopes (from a sync service
 * or another local source) are reconciled against the current store state.
 *
 * Two built-in strategies are provided:
 *
 *   - `createImmediateConcurrency()` — commits apply immediately, no
 *     rollback queue. Use this as the base database for external wrappers
 *     (e.g. a collaborative-editing layer that manages its own replay buffer).
 *
 *   - `createRebaseReplayConcurrency(userId)` — commits apply locally as
 *     transients and wait for the sync server's echoed committed envelope to
 *     promote them. Full rollback-and-replay queue, cross-peer id-determinism.
 */
export interface ConcurrencyStrategy {
    /**
     * When true, the dispatcher applies "commit" intents as transients
     * (negative time) and waits for a server echo to promote them.
     * When false, commits apply immediately with positive time.
     */
    readonly deferredCommit: boolean;

    /**
     * Peer/session identifier stamped on every outbound envelope.
     * Required for strategies that participate in a multi-peer sync protocol.
     */
    readonly userId?: number | string;

    /**
     * Process a transaction envelope. Called by the dispatcher for each
     * locally-initiated transaction and by sync services for inbound commits.
     * Does NOT fire `observe.envelopes` (that is the dispatcher's job).
     */
    readonly apply: (envelope: TransactionEnvelope) => TransactionResult<unknown> | undefined;

    /**
     * Cancel a pending transient by compound (userId, id) key.
     * No-op for strategies that have no transient queue.
     */
    readonly cancel: (id: number, userId?: number | string) => void;

    /**
     * Called by `db.reset()` before the store is cleared.
     * Strategies with a transient queue should clear it here.
     */
    readonly onReset: () => void;

    /**
     * Called immediately before `db.toData()` serializes the store.
     * Strategies with a transient queue should roll back transients here so
     * the snapshot contains only committed state.
     *
     * When this hook (together with `onAfterToData`) is present, `db.toData()`
     * serializes a detached copy of the store between the two hooks, so the
     * `onAfterToData` replay cannot corrupt the returned snapshot. See
     * `Database.toData()`.
     */
    readonly onBeforeToData?: () => void;

    /**
     * Called immediately after `db.toData()` serializes the store.
     * Strategies that roll back in `onBeforeToData` should replay here to
     * restore the in-progress transient state.
     */
    readonly onAfterToData?: () => void;

    /**
     * Called immediately after `db.fromData()` loads a snapshot into the
     * store. Strategies with a transient queue should replay pending
     * transients here so in-progress work is visible after a data load.
     */
    readonly onAfterFromData?: () => void;
}

/**
 * Factory that creates a `ConcurrencyStrategy` bound to the given execute
 * and transaction-lookup functions. Called once per database at construction.
 *
 * `execute` is the observed database's execute — it applies a transaction,
 * fires observers, and returns the mutation record.
 *
 * `getTransaction` looks up a registered transaction function by name,
 * returning undefined when the name has not yet been registered via extend.
 */
export type ConcurrencyStrategyFactory = (
    execute: (
        fn: (ctx: TransactionContext<any, any, any>) => void | Entity,
        options?: { transient?: boolean; userId?: number | string },
    ) => TransactionResult<unknown>,
    getTransaction: (
        name: string,
    ) => ((ctx: TransactionContext<any, any, any>, args: unknown) => void | Entity) | undefined,
) => ConcurrencyStrategy;
