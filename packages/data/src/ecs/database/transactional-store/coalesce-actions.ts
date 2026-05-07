// © 2026 Adobe. MIT License. See /LICENSE for details.

import { TransactionResult, TransactionWriteOperation } from "./transactional-store.js";
import { equals } from "../../../equals.js";

/**
 * Determines if two adjacent transaction results should be coalesced.
 * Transactions are coalesced when they have structurally equal coalesce values,
 * and neither has coalesce: false.
 */
export function shouldCoalesceTransactions(
    previous: TransactionResult<any>,
    current: TransactionResult<any>
): boolean {
    return !!previous.undoable &&
        !!current.undoable &&
        current.undoable.coalesce !== false &&
        previous.undoable.coalesce !== false &&
        equals(current.undoable.coalesce, previous.undoable.coalesce);
}

/**
 * Coalesces arrays of write operations, potentially merging and removing redundant operations.
 */
export function coalesceWriteOperations(operations: TransactionWriteOperation<any>[]): TransactionWriteOperation<any>[] {
    if (operations.length <= 1) return operations;

    const result: TransactionWriteOperation<any>[] = [];
    const deletedEntities = new Set<number>();
    let i = 0;

    while (i < operations.length) {
        const current = operations[i];

        if (current.type === "update") {
            const mergedValues = { ...current.values };
            let j = i + 1;

            while (j < operations.length && operations[j].type === "update") {
                const nextOp = operations[j];
                if (nextOp.type === "update" && nextOp.entity === current.entity) {
                    Object.assign(mergedValues, nextOp.values);
                    j++;
                } else {
                    break;
                }
            }

            result.push(j > i + 1 ? { type: "update", entity: current.entity, values: mergedValues } : current);
            i = j > i + 1 ? j : i + 1;
        } else if (current.type === "delete") {
            deletedEntities.add(current.entity);
            result.push(current);
            i++;
        } else {
            result.push(current);
            i++;
        }
    }

    if (deletedEntities.size === 0) return result;

    // Single O(N) pass to strip updates for entities that were later deleted.
    // An update-after-delete for the same entity is impossible in this codebase
    // (updateEntity throws "Entity not found" after a delete), so filtering all
    // updates whose entity appears in the delete set is semantics-preserving.
    return result.filter(op => !(op.type === "update" && deletedEntities.has(op.entity)));
}

/**
 * Coalesces two adjacent transaction results into a single combined transaction.
 * The current transaction's operations are applied after the previous transaction's operations.
 */
export function coalesceTransactions(
    previous: TransactionResult<any>,
    current: TransactionResult<any>
): TransactionResult<any> {
    // Combine and coalesce redo operations (apply current after previous)
    const combinedRedo = coalesceWriteOperations([...previous.redo, ...current.redo]);

    // Combine and coalesce undo operations (reverse order: undo current first, then previous)
    const combinedUndo = coalesceWriteOperations([...current.undo, ...previous.undo]);

    // Combine changed entities, components, and archetypes
    const combinedChangedEntities = new Map(previous.changedEntities);
    for (const [entity, values] of current.changedEntities) {
        combinedChangedEntities.set(entity, values);
    }

    const combinedChangedComponents = new Set(previous.changedComponents);
    for (const component of current.changedComponents) {
        combinedChangedComponents.add(component);
    }

    const combinedChangedArchetypes = new Set(previous.changedArchetypes);
    for (const archetype of current.changedArchetypes) {
        combinedChangedArchetypes.add(archetype);
    }

    return {
        value: current.value,
        transient: current.transient,
        ephemeral: previous.ephemeral && current.ephemeral,
        undoable: current.undoable,
        redo: combinedRedo,
        undo: combinedUndo,
        changedEntities: combinedChangedEntities,
        changedComponents: combinedChangedComponents,
        changedArchetypes: combinedChangedArchetypes,
    };
} 