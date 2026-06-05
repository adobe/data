// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Entity } from "../entity/entity.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";

/**
 * Reactive counterpart to an index handle's `find`. Mirrors
 * {@link observeSelectEntities}: the initial value is emitted synchronously on
 * subscribe, and subsequent values are emitted on a microtask after any
 * transaction whose changed components intersect the index's read columns —
 * the same commit boundary every other observer in the database fires on.
 *
 * Why route through transactions rather than notifying inside the index's own
 * `add` / `remove` / `update`: those run *during* a transaction body, once per
 * mutated entity, before the transaction commits. Emitting there would fire
 * observers mid-transaction against half-applied state and at a different
 * cadence than `db.observe.select`. Recomputing `find(arg)` at the commit
 * boundary instead coalesces a whole transaction into one emission and keeps
 * index reactivity consistent with the rest of the system.
 *
 * Bucket precision ("don't emit when an unrelated bucket changed") falls out
 * of comparing the freshly-recomputed entity sequence against the last emitted
 * one: an unrelated change recomputes to an identical sequence and is
 * suppressed, while a reorder *within* the observed bucket — the regression
 * case the index `find` already handles but a `where`-only `observe.select`
 * silently swallows — produces a different sequence and is emitted.
 */
export const observeIndexEntities = (
    observeTransactions: Observe<TransactionResult<any>>,
) => (
    find: (arg: unknown) => readonly Entity[],
    readColumns: readonly string[],
) => {
    const readSet = new Set<string>(readColumns);
    return (arg: unknown): Observe<readonly Entity[]> => (observer) => {
        let last = find(arg);
        let isMicrotaskQueued = false;

        const notifyObserver = () => {
            isMicrotaskQueued = false;
            const next = find(arg);
            if (sameSequence(last, next)) {
                // The relevant transaction touched a different bucket — our
                // result is unchanged, so suppress the emission.
                return;
            }
            last = next;
            observer(next);
        };

        const unobserveTransactions = observeTransactions((t) => {
            if (t.changedComponents.isDisjointFrom(readSet)) {
                // No component this index reads (key or sort) changed, so the
                // bucket contents and their order cannot have changed.
                return;
            }
            if (!isMicrotaskQueued) {
                isMicrotaskQueued = true;
                queueMicrotask(notifyObserver);
            }
        });

        observer(last);

        return () => {
            unobserveTransactions();
        };
    };
};

const sameSequence = (a: readonly Entity[], b: readonly Entity[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};
