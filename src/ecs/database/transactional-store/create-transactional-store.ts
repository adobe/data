// © 2026 Adobe. MIT License. See /LICENSE for details.
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
import { coalesceWriteOperations } from "./coalesce-actions.js";

// Sentinel value used to indicate a component should be deleted
const DELETE: unknown = "_$_DELETE_$_";

interface Transaction<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
> extends Store<C, R, A> {
    // readonly transient: boolean;
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
            debugger;
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
        Object.defineProperty(resources, name, {
            get: Object.getOwnPropertyDescriptor(store.resources, name)!.get,
            set: (newValue) => {
                updateEntity(entityId, { [resourceId]: newValue } as any);
            },
            enumerable: true,
        });
    }


    // Create transaction-aware store
    // Initialize wrapped archetypes once
    const wrappedArchetypesObject = {} as any;
    for (const name in store.archetypes) {
        wrappedArchetypesObject[name] = getWrappedArchetype(store.archetypes[name]);
    }

    const transactionStore = {
        ...store,
        archetypes: wrappedArchetypesObject,
        resources,
        ensureArchetype: (componentNames) => {
            const archetype = store.ensureArchetype(componentNames);
            return getWrappedArchetype(archetype);
        },
        update: updateEntity,
        delete: deleteEntity,
        // transient: false as boolean,
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
        // Reset transaction state
        undoOperationsInReverseOrder = [];
        redoOperations = [];
        changed.entities.clear();
        changed.components.clear();
        changed.archetypes.clear();

        try {
            // Execute the transaction
            const value = transactionFunction(transactionStore);

            // Coalesce operations to optimize redo/undo arrays
            const coalescedRedo = coalesceWriteOperations([...redoOperations]);
            const coalescedUndo = coalesceWriteOperations([...undoOperationsInReverseOrder.reverse()]);

            // Return the transaction result
            const result: TransactionResult<C> = {
                value: value ?? undefined,
                transient: options?.transient ?? false,
                undoable: transactionStore.undoable ?? null,
                redo: coalescedRedo,
                undo: coalescedUndo,
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
    const transactionalStore = {
        ...store,
        execute,
        transactionStore,
        // Override extend to sync wrapped archetypes after extending base store
        extend: (plugin: any) => {
            store.extend(plugin);
            // Sync wrapped archetypes after extension
            for (const name in store.archetypes) {
                if (!(name in wrappedArchetypesObject)) {
                    wrappedArchetypesObject[name] = getWrappedArchetype(store.archetypes[name]);
                }
            }
            return transactionalStore as any;
        },
    } as unknown as TransactionalStore<C, R, A>;

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