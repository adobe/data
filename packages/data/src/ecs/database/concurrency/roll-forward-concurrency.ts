// © 2026 Adobe. MIT License. See /LICENSE for details.

import { applyOperations } from "../transactional-store/apply-operations.js";
import type { TransactionResult, TransactionWriteOperation } from "../transactional-store/index.js";
import type { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import type { ConcurrencyStrategy, ConcurrencyStrategyFactory } from "./concurrency-strategy.js";

/**
 * A pending local edit, kept in the buffer until the server confirms it.
 * Holds the originating envelope identity, the captured post-image (`redo`)
 * tuples, and a locally-computed `undo`.
 */
type RollForwardEntry = {
    readonly id: number;
    readonly userId?: number | string;
    readonly time: number;
    /**
     * Post-image data tuples captured the first time the transaction ran.
     * Re-applied verbatim on every rebase (roll-forward); never re-derived
     * by re-running the transaction function. This is what makes the strategy
     * deterministic across differing base states.
     */
    readonly redo: TransactionWriteOperation<unknown>[];
    /**
     * Locally-computed undo for the *current* base state. Recaptured on each
     * replay because the base it must reverse changes after every rebase.
     */
    undo: TransactionWriteOperation<unknown>[];
};

/**
 * Roll-forward reconciliation: a client-side optimistic concurrency model for
 * collaborative / multi-peer editing. Provided to prove the
 * {@link ConcurrencyStrategy} seam can host a fundamentally different
 * reconciliation engine than {@link createRebaseReplayConcurrency} — it is
 * not currently wired into a real transport.
 *
 * The defining difference from {@link createRebaseReplayConcurrency}:
 *
 *   - **Roll-forward, not re-execute.** On rebase, each pending local edit is
 *     replayed by re-applying its captured post-image tuples, *not* by
 *     re-running its transaction function. A transaction that reads current
 *     state and derives a new value (e.g. "add 10 to whatever is there")
 *     therefore preserves the value it originally produced, regardless of how
 *     the confirmed base shifted underneath it. Re-execution would instead
 *     recompute against the new base.
 *
 * The rebase sequence on a confirmed (positive-time) delta:
 *   1. roll back all pending entries newest-to-oldest (apply their undo),
 *   2. apply the confirmed delta,
 *   3. replay the remaining pending entries oldest-to-newest by re-applying
 *      their captured redo tuples, recapturing fresh undo against the new base.
 *
 * Local transients carry monotonically increasing |time| (they are appended
 * as the user edits), so a newly-captured entry always sorts last; the buffer
 * is kept in arrival order and a new entry is materialized on top of the
 * replayed survivors.
 *
 * @param userId Stable peer/session identifier stamped on every outbound
 *   envelope, unique across all peers sharing the same sync server.
 */
export const createRollForwardConcurrency = (userId: number | string): ConcurrencyStrategyFactory =>
    (execute, getTransaction): ConcurrencyStrategy => {
        const pending: RollForwardEntry[] = [];

        const indexOfEntry = (id: number, entryUserId: number | string | undefined) =>
            pending.findIndex(e => e.id === id && e.userId === entryUserId);

        const rollbackAll = () => {
            for (let i = pending.length - 1; i >= 0; i--) {
                execute(t => applyOperations(t, pending[i].undo), { transient: true, userId: undefined });
            }
        };

        // Roll-forward: re-apply each pending entry's captured post-image
        // tuples and recapture fresh undo against the (possibly changed) base.
        const replayAll = () => {
            for (const entry of pending) {
                const result = execute(
                    t => applyOperations(t, entry.redo),
                    { transient: true, userId: entry.userId },
                );
                entry.undo = result.undo;
            }
        };

        // Run a transaction function once to materialize its effect and capture
        // the post-image. This is the only place a transaction function runs;
        // every subsequent rebase rolls the captured tuples forward instead.
        const runTransaction = (envelope: TransactionEnvelope): TransactionResult<unknown> => {
            const fn = getTransaction(envelope.name);
            if (!fn) throw new Error(`Unknown transaction: ${envelope.name}`);
            return execute(
                t => fn(t, envelope.args),
                { transient: envelope.time < 0, userId: envelope.userId },
            );
        };

        const removeAndRebuild = (id: number, entryUserId: number | string | undefined) => {
            const idx = indexOfEntry(id, entryUserId);
            if (idx === -1) return;
            rollbackAll();
            pending.splice(idx, 1);
            replayAll();
        };

        return {
            deferredCommit: true,
            userId,
            apply(envelope) {
                const { id, userId: envelopeUserId, time } = envelope;

                // Cancel: drop the matching pending entry and rebuild.
                if (time === 0) {
                    removeAndRebuild(id, envelopeUserId);
                    return undefined;
                }

                // Optimistic local transient: roll back, drop any prior version
                // of this transaction, replay the survivors, then run the fn on
                // top and capture its post-image tuples.
                if (time < 0) {
                    rollbackAll();
                    const existing = indexOfEntry(id, envelopeUserId);
                    if (existing !== -1) pending.splice(existing, 1);
                    replayAll();
                    const result = runTransaction(envelope);
                    const isNoOp = result.redo.length === 0 && result.undo.length === 0;
                    if (!isNoOp) {
                        pending.push({ id, userId: envelopeUserId, time, redo: result.redo, undo: result.undo });
                    }
                    return result;
                }

                // Confirmed delta (positive time): roll back all pending, drop
                // our own echo (now authoritative), apply the confirmed delta,
                // then roll the survivors forward.
                rollbackAll();
                const echo = indexOfEntry(id, envelopeUserId);
                if (echo !== -1) pending.splice(echo, 1);
                const result = runTransaction(envelope);
                replayAll();
                return result;
            },
            cancel(id, cancelUserId) {
                removeAndRebuild(id, cancelUserId);
            },
            onReset() {
                pending.length = 0;
            },
            onBeforeToData: rollbackAll,
            onAfterToData: replayAll,
            onAfterFromData: replayAll,
        };
    };
