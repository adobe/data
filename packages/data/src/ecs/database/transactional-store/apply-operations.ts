// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "../../store/index.js";
import { ID } from "../../required-components.js";
import { TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";
import { getRestoreEntity, getRewindDelete } from "../../entity-location-table/internal-ops.js";

// Applies recorded write operations to a store (undo/redo replay, rollback,
// concurrency roll-forward, reconciling replay).
export const applyOperations = (
    store: Store<any, any, any>,
    operations: TransactionWriteOperation<any>[],
    options?: { readonly rewind?: boolean },
) => {
    const rewind = options?.rewind === true;
    for (const operation of operations) {
        switch (operation.type) {
            case "insert": {
                const componentNames = [ID, ...Object.keys(operation.values)] as StringKeyof<any>[];
                const archetype = store.ensureArchetype(componentNames);
                const restore = operation.entity !== undefined ? getRestoreEntity(archetype) : undefined;
                if (restore !== undefined && operation.entity !== undefined) {
                    restore(operation.entity, operation.values);
                } else {
                    archetype.insert(operation.values as never);
                }
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
            case "delete": {
                const rewindDelete = rewind ? getRewindDelete(store) : undefined;
                if (rewindDelete !== undefined) {
                    rewindDelete(operation.entity);
                } else {
                    store.delete(operation.entity);
                }
                break;
            }
        }
    }
}
