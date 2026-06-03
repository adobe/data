// © 2026 Adobe. MIT License. See /LICENSE for details.

import { applyOperations } from "../transactional-store/apply-operations.js";
import type { TransactionResult } from "../transactional-store/index.js";
import type { ConcurrencyStrategy, ConcurrencyStrategyFactory } from "./concurrency-strategy.js";

/**
 * Lighter-weight concurrency strategy that applies commits and transients
 * immediately with no global rollback-and-replay cycle.
 *
 * Key differences from {@link createRebaseReplayConcurrency}:
 *
 *   - No deferred-commit mode — `db.transactions.X(args)` commits
 *     synchronously with positive time.
 *   - No global rebase: when an inbound committed envelope arrives, it is
 *     applied directly without rolling back other pending transients. This
 *     means entity-id allocation is NOT deterministic across peers under
 *     concurrent edits — use this only when there is a single writer or
 *     when an external layer manages replay (e.g. a coediting wrapper).
 *   - Async generator transients are still supported: each yield applies
 *     the intermediate state immediately and rolls it back when the next
 *     yield or the final commit arrives. Cancel rolls back the last
 *     applied transient for that transaction. Transients from different
 *     concurrent transactions do NOT interact (no cross-transaction rebase).
 */
export const createImmediateConcurrency = (): ConcurrencyStrategyFactory =>
    (execute, getTransaction): ConcurrencyStrategy => {
        // Per-transaction store of the last-applied transient result, keyed
        // by compound `"userId:id"`. Used to roll back a transient when a
        // newer transient, commit, or cancel arrives for the same transaction.
        const pending = new Map<string, TransactionResult<unknown>>();

        const key = (id: number, userId?: number | string) => `${userId}:${id}`;

        const rollbackPending = (id: number, userId?: number | string) => {
            const k = key(id, userId);
            const prior = pending.get(k);
            if (prior) {
                execute(t => applyOperations(t, prior.undo), { transient: true, userId: undefined });
                pending.delete(k);
            }
        };

        return {
            deferredCommit: false,
            apply(envelope) {
                const { id, userId, time, args } = envelope;

                if (time === 0) {
                    rollbackPending(id, userId);
                    return undefined;
                }

                if (time < 0) {
                    // Roll back the previous transient for this transaction (if any),
                    // then apply the new one. No interaction with other transactions.
                    rollbackPending(id, userId);
                    const fn = getTransaction(envelope.name);
                    if (!fn) throw new Error(`Unknown transaction: ${envelope.name}`);
                    const result = execute(t => fn(t, args), { transient: true, userId });
                    const isNoOp = result.redo.length === 0 && result.undo.length === 0;
                    if (!isNoOp) pending.set(key(id, userId), result);
                    return result;
                }

                // Positive time: commit. Roll back any pending transient for this
                // transaction, then apply the committed state.
                rollbackPending(id, userId);
                const fn = getTransaction(envelope.name);
                if (!fn) throw new Error(`Unknown transaction: ${envelope.name}`);
                return execute(t => fn(t, args), { transient: false, userId });
            },
            cancel(id, userId) {
                rollbackPending(id, userId);
            },
            onReset() {
                pending.clear();
            },
        };
    };
