// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "../../store/index.js";
import { ID } from "../../required-components.js";
import { TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";

// Applies recorded write operations to a store (undo/redo replay, rollback,
// concurrency roll-forward, reconciling replay).
export const applyOperations = (
    store: Store<any, any, any>,
    operations: TransactionWriteOperation<any>[]
) => {
    for (const operation of operations) {
        switch (operation.type) {
            case "insert": {
                const componentNames = [ID, ...Object.keys(operation.values)] as StringKeyof<any>[];
                const archetype = store.ensureArchetype(componentNames);
                archetype.insert(operation.values as never);
                break;
            }
            case "update": {
                // Apply to a fresh object, never the recorded op: `store.update`
                // deletes `undefined` keys from the object it is handed, and a
                // recorded op may be replayed more than once (undo → redo →
                // undo). An `undefined` value removes its column.
                store.update(operation.entity, { ...operation.values });
                break;
            }
            case "delete":
                store.delete(operation.entity);
                break;
        }
    }
}
