// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import type { TransactionContext, TransactionResult } from "../transactional-store/index.js";
import type { TransactionEnvelope } from "../reconciling/reconciling-database.js";

/**
 * A function that executes a transaction against the store, fires observers,
 * and returns the mutation record. This is the observed database's `execute`.
 */
export type ConcurrencyExecuteFn = (
    fn: (ctx: TransactionContext<any, any, any>) => void | Entity,
    options?: { transient?: boolean; userId?: number | string },
) => TransactionResult<unknown>;

/**
 * A function that looks up a registered transaction function by name.
 * Returns undefined when the name is not yet registered.
 */
export type ConcurrencyGetTransactionFn = (
    name: string,
) => ((ctx: TransactionContext<any, any, any>, args: unknown) => void | Entity) | undefined;

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
 *     (e.g. a coediting layer that manages its own replay buffer).
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
     * If provided, wraps `db.toData()`. The strategy is responsible for
     * calling `base()` and handling rollback/replay around it.
     * Omit when the strategy has no transient state that needs to be
     * excluded from the serialized snapshot.
     */
    readonly toData?: (base: () => unknown) => unknown;

    /**
     * If provided, wraps `db.fromData()`. The strategy is responsible for
     * calling `base(data)` and handling replay after the load.
     * Omit when the strategy has no transient queue to replay.
     */
    readonly fromData?: (base: (data: unknown) => void, data: unknown) => void;
}

/**
 * Factory that creates a `ConcurrencyStrategy` bound to the given execute
 * and transaction-lookup functions. Called once per database at construction.
 */
export type ConcurrencyStrategyFactory = (
    execute: ConcurrencyExecuteFn,
    getTransaction: ConcurrencyGetTransactionFn,
) => ConcurrencyStrategy;
