/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { Archetype, ArchetypeId, EntityInsertValues } from "../../archetype/index.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { Store } from "../../store/index.js";
import { Entity } from "../../entity.js";
import { EntityUpdateValues } from "../../store/core/index.js";
import { TransactionalStore, TransactionResult, TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { patchEntityValues } from "./patch-entity-values.js";

// Sentinel value used to indicate a component should be deleted
const DELETE: unknown = "_$_DELETE_$_";

interface Transaction<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
> extends Store<C, R, A> {
    readonly transient?: boolean;
}

export function createTransactionalStore<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
>(
    store: Store<C, R, A>,
): TransactionalStore<C, R, A> {

    // Transaction state (mutable during transaction execution)
    let undoOperationsInReverseOrder: TransactionWriteOperation<C>[] = [];
    let redoOperations: TransactionWriteOperation<C>[] = [];
    const changed = {
        entities: new Map<Entity, EntityUpdateValues<C> | null>(),
        components: new Set<keyof C>(),
        archetypes: new Set<ArchetypeId>(),
    };

    // Wrap archetype creation to track operations
    const wrapArchetype = (archetype: Archetype<any>) => {
        const { id } = archetype;
        return {
            ...archetype,
            get rowCount() {
                return archetype.rowCount;
            },
            insert: <T extends EntityInsertValues<C>>(values: T) => {
                const entity = archetype.insert(values as never);
                redoOperations.push({
                    type: "insert",
                    values: values,
                });
                undoOperationsInReverseOrder.push({ type: "delete", entity });
                changed.entities.set(entity, values);
                changed.archetypes.add(id);
                for (const key in values) {
                    changed.components.add(key as never);
                }
                return entity;
            },
        };
    };

    // Create wrapped archetypes for transaction tracking
    const wrappedArchetypes = new Map<ArchetypeId, any>();

    const getWrappedArchetype = (archetype: any) => {
        if (!wrappedArchetypes.has(archetype.id)) {
            wrappedArchetypes.set(archetype.id, wrapArchetype(archetype));
        }
        return wrappedArchetypes.get(archetype.id);
    };

    // Transaction-aware update function
    const updateEntity = (entity: Entity, values: EntityUpdateValues<C>) => {
        const oldValues = store.read(entity);
        if (!oldValues) {
            throw new Error(`Entity not found: ${entity}`);
        }

        const replacedValues: any = {};
        for (const name in values) {
            let newValue = (values as any)[name];
            if (newValue === DELETE) {
                newValue = undefined;
            }
            let oldValue = (oldValues as any)[name];
            if (newValue !== oldValue) {
                if (oldValue === undefined) {
                    oldValue = DELETE;
                }
                replacedValues[name] = oldValue;
                changed.components.add(name as keyof C);
            }
        }

        changed.entities.set(entity, patchEntityValues(changed.entities.get(entity), values));
        const location = store.locate(entity);
        if (location) {
            changed.archetypes.add(location.archetype.id);
        }

        // Perform the actual update
        store.update(entity, values as any);

        // Check if archetype changed after update
        const newLocation = store.locate(entity);
        if (newLocation) {
            changed.archetypes.add(newLocation.archetype.id);
        }

        // Add operations with potential combining
        addUpdateOperationsMaybeCombineLast(undoOperationsInReverseOrder, redoOperations, entity, values, replacedValues);
    };

    // Transaction-aware delete function
    const deleteEntity = (entity: Entity) => {
        const location = store.locate(entity);
        if (location) {
            changed.archetypes.add(location.archetype.id);
        }
        changed.entities.set(entity, null);

        const oldValues = store.read(entity);
        if (!oldValues) {
            throw new Error(`Entity not found: ${entity}`);
        }

        const { id: _ignore, ...oldValuesWithoutId } = oldValues as any;
        for (const key in oldValuesWithoutId) {
            changed.components.add(key as keyof C);
        }

        store.delete(entity);
        redoOperations.push({ type: "delete", entity });
        undoOperationsInReverseOrder.push({ type: "insert", values: oldValuesWithoutId });
    };

    const resources = {} as { [K in keyof R]: R[K] };
    for (const name of Object.keys(store.resources)) {
        const resourceId = name as keyof C;
        const archetype = store.ensureArchetype(["id", resourceId] as StringKeyof<C>[]);
        const entityId = archetype.columns.id.get(0);
        const resourceSchema = store.componentSchemas[resourceId as StringKeyof<C>];
        const isTransient = resourceSchema?.transient ?? false;
        
        Object.defineProperty(resources, name, {
            get: Object.getOwnPropertyDescriptor(store.resources, name)!.get,
            set: (newValue) => {
                updateEntity(entityId, { [resourceId]: newValue } as any);
                if (isTransient) {
                    (transactionStore as any).transient = true;
                }
            },
            enumerable: true,
        });
    }


    // Create transaction-aware store
    const transactionStore = {
        ...store,
        archetypes: Object.fromEntries(Object.entries(store.archetypes).map(([key, value]) => [key, getWrappedArchetype(value)])) as any,
        resources,
        ensureArchetype: (componentNames) => {
            const archetype = store.ensureArchetype(componentNames);
            return getWrappedArchetype(archetype);
        },
        update: updateEntity,
        delete: deleteEntity,
        transient: undefined,
        undoable: undefined,
    } satisfies Transaction<C, R, A>;

    // Execute transaction function
    const execute = (
        transactionFunction: (t: Transaction<C, R, A>) => Entity | void,
        options?: {
            transient?: boolean;
        }
    ): TransactionResult<C> => {
        transactionStore.undoable = undefined;
        transactionStore.transient = undefined;
        // Reset transaction state
        undoOperationsInReverseOrder = [];
        redoOperations = [];
        changed.entities.clear();
        changed.components.clear();
        changed.archetypes.clear();

        try {
            // Execute the transaction
            const value = transactionFunction(transactionStore);

            // Return the transaction result
            const result: TransactionResult<C> = {
                value: value ?? undefined,
                transient: options?.transient ?? transactionStore.transient ?? false,
                undoable: transactionStore.undoable ?? null,
                redo: [...redoOperations],
                undo: [...undoOperationsInReverseOrder.reverse()],
                changedEntities: new Map(changed.entities),
                changedComponents: new Set(changed.components),
                changedArchetypes: new Set(changed.archetypes),
            };

            return result;
        } catch (error) {
            // Rollback on error by applying undo operations in reverse
            applyWriteOperations(store, undoOperationsInReverseOrder.reverse());
            throw error;
        } finally {
            // Clean up transaction state
            undoOperationsInReverseOrder = [];
            redoOperations = [];
            changed.entities.clear();
            changed.components.clear();
            changed.archetypes.clear();
            wrappedArchetypes.clear();
        }
    };

    // Create the transactional store interface
    const transactionalStore: TransactionalStore<C, R, A> = {
        ...store,
        execute,
        transactionStore,
    };

    return transactionalStore as any;
}

// Helper function to combine update operations for the same entity
function addUpdateOperationsMaybeCombineLast<C>(
    undoOperationsInReverseOrder: TransactionWriteOperation<C>[],
    redoOperations: TransactionWriteOperation<C>[],
    entity: Entity,
    values: EntityUpdateValues<C>,
    replacedValues: EntityUpdateValues<C>
) {
    const lastUndoOperation: TransactionWriteOperation<C> | undefined =
        undoOperationsInReverseOrder[undoOperationsInReverseOrder.length - 1];

    if (
        lastUndoOperation?.type === "update" &&
        lastUndoOperation.entity === entity
    ) {
        // Combine with previous update operation
        const lastRedoOperation = redoOperations[redoOperations.length - 1];
        if (lastRedoOperation?.type === "update") {
            lastRedoOperation.values = { ...lastRedoOperation.values, ...values };
            lastUndoOperation.values = {
                ...replacedValues,
                ...lastUndoOperation.values,
            };
        }
    } else {
        // Add new update operations
        redoOperations.push({ type: "update", entity, values });
        undoOperationsInReverseOrder.push({
            type: "update",
            entity,
            values: replacedValues,
        });
    }
}

// Helper function to apply write operations for rollback
function applyWriteOperations<C extends Components, R extends ResourceComponents, A extends ArchetypeComponents<StringKeyof<C>>>(
    store: Store<C, R, A>,
    operations: TransactionWriteOperation<C>[]
): void {
    for (const operation of operations) {
        switch (operation.type) {
            case "insert": {
                const componentNames = ["id", ...Object.keys(operation.values)] as StringKeyof<C>[];
                const archetype = store.ensureArchetype(componentNames);
                archetype.insert(operation.values as any);
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