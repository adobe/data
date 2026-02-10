// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "../../store/index.js";
import { TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";

// Helper function to apply write operations for rollback
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
            case "update":
                store.update(operation.entity, operation.values);
                break;
            case "delete":
                store.delete(operation.entity);
                break;
        }
    }
}
