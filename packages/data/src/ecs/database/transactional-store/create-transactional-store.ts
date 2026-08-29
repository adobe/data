// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype, ArchetypeId, EntityInsertValues } from "../../archetype/index.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { Store } from "../../store/index.js";
import { Entity } from "../../entity/entity.js";
import { ID } from "../../required-components.js";
import { EntityUpdateValues } from "../../store/core/index.js";
import { TransactionalStore, TransactionResult, TransactionWriteOperation } from "./transactional-store.js";
import { StringKeyof } from "../../../types/types.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { patchEntityValues } from "./patch-entity-values.js";
import { coalesceWriteOperations } from "./coalesce-actions.js";
import { applyOperations, DELETE } from "./apply-operations.js";

interface Transaction<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
> extends Store<C, R, A> {
    userId: number | string | undefined;
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
    let hasPersistentChange = false;
    const trackEntity = (entity: Entity) => {
        if (Entity.isPersistent(entity)) hasPersistentChange = true;
    };
    const changed = {
        entities: new Map<Entity, EntityUpdateValues<C> | null>(),
        components: new Set<string>(),
        archetypes: new Set<ArchetypeId>(),
        // Entities relocated to a new backing row as a SIDE EFFECT of this
        // transaction (swap-moved neighbors of a delete/migration, and the
        // migrated entity itself) — NOT the entities the transaction directly
        // touched. Their columns are not covered by `entities`, so a consumer
        // must full-write them. See TransactionResult.relocatedEntities.
        moves: new Set<Entity>(),
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
                trackEntity(entity);
                redoOperations.push({
                    type: "insert",
                    values: values,
                });
                undoOperationsInReverseOrder.push({ type: "delete", entity });
                changed.entities.set(entity, values);
                changed.archetypes.add(id);
                for (const key in values) {
                    changed.components.add(key);
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

    const updateEntity = (entity: Entity, values: EntityUpdateValues<C>): Entity | undefined => {
        trackEntity(entity);
        const oldValues = store.read(entity);
        if (!oldValues) {
            throw new Error(`Entity not found: ${entity}`);
        }

        const replacedValues: any = {};
        for (const name in values) {
            const newValue = (values as any)[name];
            let oldValue = (oldValues as any)[name];
            if (newValue !== oldValue) {
                if (oldValue === undefined) {
                    oldValue = DELETE;
                }
                replacedValues[name] = oldValue;
                changed.components.add(name);
            }
        }

        changed.entities.set(entity, patchEntityValues(changed.entities.get(entity), values));
        const location = store.locate(entity);
        if (location) {
            changed.archetypes.add(location.archetype.id);
        }

        // The core store mutates `values` in place: when a value is `undefined` it
        // deletes that key so it can reuse the object as the new (smaller) archetype's
        // row data. Snapshot the redo values first — otherwise a column-removal update
        // (`{ comp: undefined }`) records an empty redo op and redo becomes a no-op,
        // so delete -> undo -> redo would leave the column in place.
        const redoValues = { ...values };

        // Perform the actual update
        const swapped = store.update(entity, values as any);
        if (swapped !== undefined) {
            // The update migrated `entity` to a new archetype; its old
            // archetype swap-moved `swapped` into the vacated row.
            changed.moves.add(swapped);
        }

        // Check if archetype changed after update
        const newLocation = store.locate(entity);
        if (newLocation) {
            changed.archetypes.add(newLocation.archetype.id);
            // A migration relocates `entity` itself to a fresh row whose other
            // columns are carried over (not in `values`), so it must be
            // full-written by consumers even though it is a "changed" entity.
            if (!location || newLocation.archetype.id !== location.archetype.id || newLocation.row !== location.row) {
                changed.moves.add(entity);
            }
        }

        // Add operations with potential combining
        addUpdateOperationsMaybeCombineLast(undoOperationsInReverseOrder, redoOperations, entity, redoValues, replacedValues);
        return swapped;
    };

    const deleteEntity = (entity: Entity): Entity | undefined => {
        trackEntity(entity);
        const location = store.locate(entity);
        if (location) {
            changed.archetypes.add(location.archetype.id);
        }
        changed.entities.set(entity, null);

        const oldValues = store.read(entity);
        if (!oldValues) {
            throw new Error(`Entity not found: ${entity}`);
        }

        // `store.read` already excludes the identity column, so `oldValues` carries
        // only the entity's components — exactly what the undo `insert` restores.
        for (const key in oldValues) {
            changed.components.add(key);
        }

        const swapped = store.delete(entity);
        if (swapped !== undefined) {
            // Deleting `entity` swap-moved `swapped` into the vacated row.
            changed.moves.add(swapped);
        }
        redoOperations.push({ type: "delete", entity });
        // A live entity carries every component its archetype requires, so the
        // id-excluded read values form a complete insert payload — a runtime
        // invariant the checker can't derive from the all-optional read type.
        undoOperationsInReverseOrder.push({ type: "insert", values: oldValues as unknown as EntityInsertValues<C> });
        return swapped;
    };

    const resourceComponentNames = (name: string): StringKeyof<C>[] => {
        const schema = (store.componentSchemas as any)[name];
        const names = [ID, name] as StringKeyof<C>[];
        if (schema?.nonPersistent) names.push("nonPersistent" as StringKeyof<C>);
        if (schema?.nonShared) names.push("nonShared" as StringKeyof<C>);
        return names;
    };

    const resources = {} as { [K in keyof R]: R[K] };
    for (const name of Object.keys(store.resources)) {
        const resourceId = name as keyof C;
        const componentNames = resourceComponentNames(name);
        const archetype = store.ensureArchetype(componentNames);
        Object.defineProperty(resources, name, {
            get: Object.getOwnPropertyDescriptor(store.resources, name)!.get,
            set: (newValue) => {
                // Resolve the singleton's CURRENT id at write time: fromData/reset
                // re-creates the resource singleton under a fresh id, so an id
                // captured here would go stale (row 0 of this archetype is always
                // the singleton).
                updateEntity(archetype.columns[ID].get(0), { [resourceId]: newValue } as any);
            },
            enumerable: true,
            // Configurable so pruneToSchema can drop a retired resource's accessor
            // (mirrors the base store's resource definitions).
            configurable: true,
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
        undoable: undefined,
        userId: undefined as number | string | undefined,
    } satisfies Transaction<C, R, A>;

    // Execute transaction function
    const execute = (
        transactionFunction: (t: Store<C, R, A>) => Entity | void,
        options?: {
            intermediate?: boolean;
            userId?: number | string;
        }
    ): TransactionResult<C> => {
        transactionStore.undoable = undefined;
        transactionStore.userId = options?.userId;
        undoOperationsInReverseOrder = [];
        redoOperations = [];
        hasPersistentChange = false;
        changed.entities.clear();
        changed.components.clear();
        changed.archetypes.clear();
        changed.moves.clear();

        try {
            // Execute the transaction
            const value = transactionFunction(transactionStore);

            // Coalesce operations to optimize redo/undo arrays
            const coalescedRedo = coalesceWriteOperations([...redoOperations]);
            const coalescedUndo = coalesceWriteOperations([...undoOperationsInReverseOrder.reverse()]);

            const result: TransactionResult<C> = {
                value: value ?? undefined,
                intermediate: options?.intermediate ?? false,
                persistent: hasPersistentChange,
                undoable: transactionStore.undoable ?? null,
                redo: coalescedRedo,
                undo: coalescedUndo,
                changedEntities: new Map(changed.entities),
                changedComponents: new Set(changed.components),
                changedArchetypes: new Set(changed.archetypes),
                relocatedEntities: new Set(changed.moves),
            };

            return result;
        } catch (error) {
            // Rollback on error by applying undo operations in reverse
            applyOperations(store, undoOperationsInReverseOrder.reverse());
            throw error;
        } finally {
            transactionStore.userId = undefined;
            undoOperationsInReverseOrder = [];
            redoOperations = [];
            hasPersistentChange = false;
            changed.entities.clear();
            changed.components.clear();
            changed.archetypes.clear();
            changed.moves.clear();
            wrappedArchetypes.clear();
        }
    };

    // Create the transactional store interface
    const transactionalStore = {
        ...store,
        execute,
        transactionStore,
        // Prune the base store, then sync the transactional resource wrapper by
        // dropping any resource the base store no longer exposes (mirror of the
        // additive sync in `extend`). Archetype ids are unchanged by prune, so the
        // lazily-wrapped archetype handles stay valid.
        pruneToSchema: (keep: ReadonlySet<string>) => {
            store.pruneToSchema(keep);
            for (const name of Object.keys(resources)) {
                if (!Object.hasOwn(store.resources, name)) {
                    delete (resources as Record<string, unknown>)[name];
                }
            }
        },
        // Override extend to sync wrapped archetypes and resources after extending base store
        extend: (plugin: any) => {
            store.extend(plugin);
            // Sync wrapped archetypes after extension
            for (const name in store.archetypes) {
                if (!(name in wrappedArchetypesObject)) {
                    wrappedArchetypesObject[name] = getWrappedArchetype(store.archetypes[name]);
                }
            }
            for (const name of Object.keys(store.resources)) {
                if (!Object.hasOwn(resources, name)) {
                    const resourceId = name as keyof C;
                    const componentNames = resourceComponentNames(name);
                    const archetype = store.ensureArchetype(componentNames);
                    Object.defineProperty(resources, name, {
                        get: Object.getOwnPropertyDescriptor(store.resources, name)!.get,
                        set: (newValue: any) => {
                            // Resolve the singleton's CURRENT id at write time (see
                            // the initial resource loop above) — a captured id goes
                            // stale across a fromData/reset re-create.
                            updateEntity(archetype.columns[ID].get(0), { [resourceId]: newValue } as any);
                        },
                        enumerable: true,
                        configurable: true,
                    });
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