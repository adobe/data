// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../../types/types.js";
import { TransactionResult } from "../transactional-store/index.js";
import { applyOperations } from "../transactional-store/apply-operations.js";
import type { TransactionDeclarations } from "../../store/transaction-functions.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { Store } from "../../store/index.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { ReconcilingDatabase, TransactionEnvelope } from "./reconciling-database.js";
import { ReconcilingEntry, ReconcilingEntryOps } from "./reconciling-entry.js";
import { createObservedDatabase } from "../observed/create-observed-database.js";
import { Entity } from "../../entity.js";

export function createReconcilingDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
): ReconcilingDatabase<C, R, A, TD> {
    type TransactionName = Extract<keyof TD, string>;

    const transactionDeclarationsRef: TransactionDeclarations<C, R, A> = {
        ...transactionDeclarations,
    };

    const observedDatabase = createObservedDatabase(store);
    const {
        execute,
        observe,
        resources,
        toData: observedToData,
        fromData: observedFromData,
        ...storeMethods
    } = observedDatabase;

    const reconcilingEntries: ReconcilingEntry<C, R, A>[] = [];

    const rollbackEntryResult = (entry: ReconcilingEntry<C, R, A>) => {
        if (entry.result) {
            execute(t => applyOperations(t, entry.result!.undo), { transient: true });
            entry.result = undefined;
        }
    };

    const rollbackAllTransients = () => {
        for (let i = reconcilingEntries.length - 1; i >= 0; i--) {
            rollbackEntryResult(reconcilingEntries[i]);
        }
    };

    const removeTransientEntry = (id: number): boolean => {
        const index = reconcilingEntries.findIndex(entry => entry.id === id);
        if (index === -1) {
            return false;
        }
        rollbackEntryResult(reconcilingEntries[index]);
        reconcilingEntries.splice(index, 1);
        return true;
    };

    const executeEntry = (entry: ReconcilingEntry<C, R, A>) => {
        const result = execute(
            t => entry.transaction(t, entry.args),
            { transient: true },
        );

        // Only store result if it actually made changes (not a no-op).
        // A no-op transaction has empty redo/undo operations.
        const isNoOp = result.redo.length === 0 && result.undo.length === 0;
        entry.result = isNoOp ? undefined : result;

        return result;
    };

    const replayAllTransients = () => {
        let lastResult: TransactionResult<C> | undefined;
        for (const entry of reconcilingEntries) {
            lastResult = executeEntry(entry);
        }
        return lastResult;
    };

    const applyEnvelope = (envelope: TransactionEnvelope<TransactionName>): TransactionResult<C> | undefined => {
        const transaction = transactionDeclarationsRef[envelope.name];
        if (!transaction) {
            throw new Error(`Unknown transaction: ${envelope.name as string}`);
        }

        const { id, time, args } = envelope;
        const transactionFn = transaction as (store: Store<C, R, A>, args: unknown) => void | Entity;

        // Handle cancellation: remove any transient entry for this id.
        if (time === 0) {
            const index = reconcilingEntries.findIndex(entry => entry.id === id);
            if (index === -1) {
                return undefined;
            }
            rollbackAllTransients();
            reconcilingEntries.splice(index, 1);
            replayAllTransients();
            return undefined;
        }

        // Handle transient application (negative time).
        if (time < 0) {
            // Replace any existing transient entry for this id.
            removeTransientEntry(id);

            // Create and insert the new transient entry.
            const entry: ReconcilingEntry<C, R, A> = {
                id,
                name: envelope.name,
                transaction: transactionFn,
                args,
                time,
                result: undefined,
            };

            const insertIndex = ReconcilingEntryOps.findInsertIndex(reconcilingEntries, entry);
            reconcilingEntries.splice(insertIndex, 0, entry);

            // Rebuild transient state from scratch to respect time ordering.
            rollbackAllTransients();
            return replayAllTransients();
        }

        // Handle committed application (positive time): just execute once, do not
        // retain in memory. Clear any existing transient for this id first.
        removeTransientEntry(id);

        return execute(
            t => transactionFn(t, args),
            { transient: false },
        );
    };

    const cancelEntry = (id: number) => {
        const index = reconcilingEntries.findIndex(entry => entry.id === id);
        if (index === -1) {
            return;
        }
        rollbackAllTransients();
        reconcilingEntries.splice(index, 1);
        replayAllTransients();
    };

    const reconcilingDatabase: ReconcilingDatabase<C, R, A, TD> = {
        ...storeMethods,
        resources,
        execute,
        observe,
        toData: () => {
            rollbackAllTransients();
            const data = observedToData();
            replayAllTransients();
            return data;
        },
        fromData: (data: unknown) => {
            observedFromData(data);
            replayAllTransients();
        },
        apply: applyEnvelope,
        cancel: cancelEntry,
        extend: (plugin: any) => {
            // Extend the underlying observed database (which extends transactionalStore -> store)
            observedDatabase.extend(plugin);
            // Extend our transaction declarations
            if (plugin.transactions) {
                Object.assign(transactionDeclarationsRef, plugin.transactions);
            }
            return reconcilingDatabase as any;
        },
    };

    return reconcilingDatabase;
}

