// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "../../store/index.js";
import { TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";

/**
 * Sentinel recorded in an undo/redo op's update values to mean "this column
 * had no pre-image — remove it" (a column that a transaction had *added*).
 * It is resolved back to `undefined` when the op is applied, so the column is
 * removed rather than written literally. Lives here — the single point where
 * recorded ops re-enter a store — so every replay path resolves it uniformly.
 */
export const DELETE: unknown = "_$_DELETE_$_";

// Applies recorded write operations to a store (undo/redo replay, rollback,
// concurrency roll-forward, reconciling replay).
export const applyOperations = (
    store: Store<any, any, any>,
    operations: TransactionWriteOperation<any>[]
) => {
    for (const operation of operations) {
        switch (operation.type) {
            case "insert": {
                const componentNames = ["id", ...Object.keys(operation.values)] as StringKeyof<any>[];
                const archetype = store.ensureArchetype(componentNames);
                archetype.insert(operation.values as never);
                break;
            }
            case "update": {
                // Apply to a fresh object, never the recorded op: `store.update`
                // deletes `undefined` keys from the object it is handed, and a
                // recorded op may be replayed more than once (undo → redo →
                // undo). Resolve the DELETE sentinel to `undefined` so an
                // added-then-undone column is removed, not written literally.
                const values: Record<string, unknown> = {};
                for (const key in operation.values) {
                    const value = (operation.values as Record<string, unknown>)[key];
                    values[key] = value === DELETE ? undefined : value;
                }
                store.update(operation.entity, values);
                break;
            }
            case "delete":
                store.delete(operation.entity);
                break;
        }
    }
}
