// © 2026 Adobe. MIT License. See /LICENSE for details.

import { applyOperations } from "../transactional-store/apply-operations.js";
import { TransactionResult } from "../transactional-store/index.js";
import { TransactionEnvelope } from "./reconciling-database.js";
import { ReconcilingEntry, ReconcilingEntryOps } from "./reconciling-entry.js";
import type { ConcurrencyStrategyFactory } from "../concurrency/concurrency-strategy.js";

/**
 * Core rebase-replay logic shared by {@link createReconcilingDatabase} (legacy
 * typed API) and {@link createRebaseReplayConcurrency} (pluggable strategy).
 *
 * Given an `execute` function (from the observed database layer) and a
 * `getTransaction` lookup, manages a pending-transient queue and provides
 * the rollback-and-replay protocol:
 *
 *   1. Roll back all transients in reverse stack order.
 *   2. Apply the committed envelope once (non-transient).
 *   3. Replay the surviving transients on top.
 *
 * This guarantees the freelist / nextIndex snapshot at step 2 is identical
 * on every peer, regardless of what local transients were pending when the
 * broadcast arrived.
 */
export function createRebaseReplayApplier(
    ...args: Parameters<ConcurrencyStrategyFactory>
): {
    apply: (envelope: TransactionEnvelope) => TransactionResult<unknown> | undefined;
    cancel: (id: number, userId?: number | string) => void;
    onReset: () => void;
    rollbackAllTransients: () => void;
    replayAllTransients: () => TransactionResult<unknown> | undefined;
} {
    const [execute, getTransaction] = args;
    const reconcilingEntries: ReconcilingEntry[] = [];

    const rollbackEntryResult = (entry: ReconcilingEntry) => {
        if (entry.result) {
            execute(t => applyOperations(t, entry.result!.undo), { transient: true, userId: undefined });
            entry.result = undefined;
        }
    };

    const rollbackAllTransients = () => {
        for (let i = reconcilingEntries.length - 1; i >= 0; i--) {
            rollbackEntryResult(reconcilingEntries[i]);
        }
    };

    const executeEntry = (entry: ReconcilingEntry) => {
        const fn = getTransaction(entry.name);
        if (!fn) throw new Error(`Unknown transaction during replay: ${entry.name}`);
        const result = execute(t => fn(t, entry.args), { transient: true, userId: entry.userId });
        const isNoOp = result.redo.length === 0 && result.undo.length === 0;
        entry.result = isNoOp ? undefined : result;
        return result;
    };

    const replayAllTransients = () => {
        let lastResult: TransactionResult<unknown> | undefined;
        for (const entry of reconcilingEntries) {
            lastResult = executeEntry(entry);
        }
        return lastResult;
    };

    const spliceTransientEntry = (id: number, userId: number | string | undefined): boolean => {
        const index = reconcilingEntries.findIndex(e => e.id === id && e.userId === userId);
        if (index === -1) return false;
        reconcilingEntries.splice(index, 1);
        return true;
    };

    const apply = (envelope: TransactionEnvelope): TransactionResult<unknown> | undefined => {
        const { id, userId, time, args } = envelope;

        if (time === 0) {
            const index = reconcilingEntries.findIndex(e => e.id === id && e.userId === userId);
            if (index === -1) return undefined;
            rollbackAllTransients();
            reconcilingEntries.splice(index, 1);
            replayAllTransients();
            return undefined;
        }

        if (time < 0) {
            const fn = getTransaction(envelope.name);
            if (!fn) throw new Error(`Unknown transaction: ${envelope.name}`);

            rollbackAllTransients();
            spliceTransientEntry(id, userId);

            const entry: ReconcilingEntry = {
                id,
                userId,
                name: envelope.name,
                transaction: fn,
                args,
                time,
                result: undefined,
            };

            const insertIndex = ReconcilingEntryOps.findInsertIndex(reconcilingEntries, entry);
            reconcilingEntries.splice(insertIndex, 0, entry);

            const result = replayAllTransients();

            if (entry.result === undefined) {
                const idx = reconcilingEntries.indexOf(entry);
                if (idx !== -1) reconcilingEntries.splice(idx, 1);
            }

            return result;
        }

        // Positive time: committed. Rebase transient queue around this commit.
        const fn = getTransaction(envelope.name);
        if (!fn) throw new Error(`Unknown transaction: ${envelope.name}`);
        rollbackAllTransients();
        spliceTransientEntry(id, userId);
        const result = execute(t => fn(t, args), { transient: false, userId });
        replayAllTransients();
        return result;
    };

    const cancel = (id: number, userId?: number | string) => {
        const index = reconcilingEntries.findIndex(e => e.id === id && e.userId === userId);
        if (index === -1) return;
        rollbackAllTransients();
        reconcilingEntries.splice(index, 1);
        replayAllTransients();
    };

    const onReset = () => {
        reconcilingEntries.length = 0;
    };

    return { apply, cancel, onReset, rollbackAllTransients, replayAllTransients };
}
