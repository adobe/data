// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createRebaseReplayApplier } from "../reconciling/create-rebase-replay-applier.js";
import type { ConcurrencyStrategy, ConcurrencyStrategyFactory } from "./concurrency-strategy.js";

/**
 * Concurrency strategy that implements the optimistic rebase-replay protocol
 * required for multi-peer synchronisation.
 *
 * Behaviour:
 *   - Local "commit" intents are applied as transients (negative time) and
 *     wait for the sync server's echoed committed envelope to promote them
 *     via rollback-and-replay. This is required for cross-peer entity-id
 *     determinism under concurrent edits.
 *   - Every outbound envelope is stamped with `userId` so the reconciler's
 *     compound `(userId, id)` key keeps concurrent peers' id counters from
 *     colliding.
 *   - `onBeforeToData` / `onAfterToData` roll back and replay the transient
 *     queue around serialisation so snapshots always contain only committed state.
 *
 * @param userId Stable peer/session identifier unique across all peers
 *   sharing the same sync server.
 */
export const createRebaseReplayConcurrency = (userId: number | string): ConcurrencyStrategyFactory =>
    (...args): ConcurrencyStrategy => {
        const applier = createRebaseReplayApplier(...args);
        return {
            deferredCommit: true,
            userId,
            apply: applier.apply,
            cancel: applier.cancel,
            onReset: applier.onReset,
            onBeforeToData: applier.rollbackAllTransients,
            onAfterToData: applier.replayAllTransients,
            onAfterFromData: applier.replayAllTransients,
        };
    };
