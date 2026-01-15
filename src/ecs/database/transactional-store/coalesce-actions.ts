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

    // Simple approach: just merge consecutive update operations on the same entity
    const result: TransactionWriteOperation<any>[] = [];
    let i = 0;

    while (i < operations.length) {
        const current = operations[i];

        // Look ahead to see if we can merge with next operations
        if (current.type === "update") {
            const mergedValues = { ...current.values };
            let j = i + 1;

            // Merge consecutive updates on the same entity
            while (j < operations.length &&
                operations[j].type === "update") {
                const nextOp = operations[j];
                if (nextOp.type === "update" && nextOp.entity === current.entity) {
                    Object.assign(mergedValues, nextOp.values);
                    j++;
                } else {
                    break;
                }
            }

            if (j > i + 1) {
                // We merged some operations
                result.push({
                    type: "update",
                    entity: current.entity,
                    values: mergedValues
                });
                i = j;
            } else {
                // No merging possible
                result.push(current);
                i++;
            }
        } else if (current.type === "insert") {
            // Cannot safely merge insert + update since insert doesn't have an entity ID
            // to verify the update is on the same entity
            result.push(current);
            i++;
        } else {
            // For delete operations, remove any preceding update operations on the same entity
            if (current.type === "delete") {
                // Remove any preceding update operations on the same entity
                const deleteEntity = current.entity;
                for (let k = result.length - 1; k >= 0; k--) {
                    const op = result[k];
                    if (op.type === "update" && op.entity === deleteEntity) {
                        result.splice(k, 1);
                    }
                }
                
                // Add the delete operation
                result.push(current);
                i++;
            } else {
                result.push(current);
                i++;
            }
        }
    }

    return result;
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

    // Create combined transaction result
    return {
        value: current.value,
        transient: current.transient,
        undoable: current.undoable,
        redo: combinedRedo,
        undo: combinedUndo,
        changedEntities: combinedChangedEntities,
        changedComponents: combinedChangedComponents,
        changedArchetypes: combinedChangedArchetypes,
    };
} 