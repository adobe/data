// © 2026 Adobe. MIT License. See /LICENSE for details.

import { mapEntries } from "../../../internal/object/index.js";
import { Observe } from "../../../observe/index.js";
import { StringKeyof } from "../../../types/types.js";
import { Components } from "../../store/components.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { Archetype, ArchetypeId, ReadonlyArchetype } from "../../archetype/index.js";
import { Store } from "../../store/index.js";
import { TransactionResult } from "../transactional-store/index.js";
import { PersistenceScope, ToDataOptions } from "../../persistence-scope.js";
import { observeSelectEntities } from "../observe-select-entities.js";
import { createDerive } from "../observe-derive.js";
import { createTransactionalStore } from "../transactional-store/create-transactional-store.js";
import { Entity } from "../../entity/entity.js";
import { EntityReadValues, EntityUpdateValues } from "../../store/core/index.js";
import { ObservedDatabase } from "./observed-database.js";

const addToMapSet = <K, T>(key: K, map: Map<K, Set<T>>) => (value: T) => {
    let set = map.get(key);
    if (set) {
        set.add(value);
    } else {
        map.set(key, (set = new Set([value])));
    }
    return () => {
        set!.delete(value);
    };
};

export function createObservedDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>
>(
    store: Store<C, R, A>,
): ObservedDatabase<C, R, A> {
    const transactionalStore = createTransactionalStore(store);
    const { execute: transactionalExecute, resources, ...rest } = transactionalStore;

    const componentObservers = new Map<StringKeyof<C>, Set<() => void>>();
    const archetypeObservers = new Map<ArchetypeId, Set<() => void>>();
    const entityObservers = new Map<Entity, Set<(values: EntityReadValues<C> | null) => void>>();
    const transactionObservers = new Set<(transaction: TransactionResult<C>) => void>();

    const notifyObservers = (result: TransactionResult<C>) => {
        // Don't notify for no-op actions (no actual changes made)
        // Check if there are any changed entities, components, or archetypes
        const hasChanges = result.changedEntities.size > 0 ||
            result.changedComponents.size > 0 ||
            result.changedArchetypes.size > 0;

        if (!hasChanges) {
            return;
        }

        for (const observer of transactionObservers) {
            observer(result);
        }
        for (const changedComponent of result.changedComponents) {
            const observers = componentObservers.get(changedComponent as StringKeyof<C>);
            if (observers) {
                for (const observer of observers) {
                    observer();
                }
            }
        }
        for (const changedArchetype of result.changedArchetypes) {
            const observers = archetypeObservers.get(changedArchetype);
            if (observers) {
                for (const observer of observers) {
                    observer();
                }
            }
        }
        for (const changedEntity of result.changedEntities.keys()) {
            const observers = entityObservers.get(changedEntity);
            if (observers) {
                const values = store.read(changedEntity);
                for (const observer of observers) {
                    observer(values);
                }
            }
        }
    };

    const execute: ObservedDatabase<C, R, A>["execute"] = (handler, options) => {
        const result = transactionalExecute(handler, options);
        notifyObservers(result);
        return result;
    };

    const observeEntity = <T>(entity: Entity, minArchetype?: ReadonlyArchetype<T> | Archetype<T>) => (observer: (values: EntityReadValues<C> | null) => void) => {
        if (minArchetype) {
            const originalObserver = observer;
            observer = (values) => {
                if (values) {
                    const location = store.locate(entity);
                    if (location) {
                        const { archetype } = location;
                        if (archetype.id !== minArchetype.id && !archetype.components.isSupersetOf(minArchetype.components)) {
                            values = null;
                        }
                    }
                }
                originalObserver(values);
            };
        }
        observer(store.read(entity));
        const dispose = addToMapSet(entity, entityObservers)(observer);
        return dispose;
    };

    const observeArchetype = (archetype: ArchetypeId) => addToMapSet(archetype, archetypeObservers);
    const observeComponent = mapEntries(store.componentSchemas, ([component]) => addToMapSet(component, componentObservers));

    const resourceArchetypeComponents = (resource: string): StringKeyof<C>[] => {
        const schema = (store.componentSchemas as any)[resource];
        const names: StringKeyof<C>[] = ["id" as StringKeyof<C>, resource as unknown as StringKeyof<C>];
        if (schema?.nonPersistent) names.push("nonPersistent" as StringKeyof<C>);
        if (schema?.nonShared) names.push("nonShared" as StringKeyof<C>);
        return names;
    };

    const observeResource = Object.fromEntries(
        Object.entries(store.resources).map(([resource]) => {
            const archetype = store.ensureArchetype(resourceArchetypeComponents(resource));
            const resourceId = archetype.columns.id.get(0);
            return [resource, Observe.withMap(observeEntity(resourceId), (values) => (values as any)?.[resource] ?? null)];
        })
    ) as { [K in StringKeyof<R>]: Observe<R[K]>; };

    const observeTransaction: Observe<TransactionResult<C>> = (notify: (transaction: TransactionResult<C>) => void) => {
        transactionObservers.add(notify);
        return () => {
            transactionObservers.delete(notify);
        };
    };

    const observe: ObservedDatabase<C, R, A>["observe"] = {
        components: observeComponent,
        resources: observeResource,
        transactions: observeTransaction,
        entity: observeEntity,
        archetype: observeArchetype,
        select: observeSelectEntities(transactionalStore, observeTransaction),
    };

    const notifyAllObserversStoreReloaded = () => {
        const notifyResult: TransactionResult<C> = {
            changedComponents: new Set(componentObservers.keys()),
            changedArchetypes: new Set(archetypeObservers.keys()),
            changedEntities: new Map([...entityObservers.keys()].map((entity) => {
                // `store.read` already excludes `id`, so the read record IS the
                // full component set to report as changed. The read shape
                // (optional, readonly) and EntityUpdateValues (Partial<Omit<…,id>>)
                // are computed differently, so bridge through `unknown`.
                const values = store.read(entity);
                const updateValues: EntityUpdateValues<C> | null = values
                    ? values as unknown as EntityUpdateValues<C>
                    : null;
                return [
                    entity,
                    updateValues
                ];
            })),
            intermediate: false,
            persistent: true,
            value: undefined,
            undo: [],
            redo: [],
            undoable: null,
            // A full-store reload is not a swap/migration side effect; every
            // present entity is already re-materialized via changedEntities.
            relocatedEntities: new Set(),
        };
        notifyObservers(notifyResult);
    };

    const observedDatabase: ObservedDatabase<C, R, A> = {
        ...rest,
        resources,
        observe,
        derive: createDerive(store, observeTransaction),
        execute,
        reset: () => {
            store.reset();
            notifyAllObserversStoreReloaded();
        },
        toData: (options?: ToDataOptions) => store.toData(options),
        fromData: (data: unknown, scope?: PersistenceScope) => {
            store.fromData(data, scope);
            notifyAllObserversStoreReloaded();
        },
        extend: (plugin: any) => {
            transactionalStore.extend(plugin);
            // Rebuild observe.components and observe.resources so new components/resources from extend are observable
            (observe as any).components = mapEntries(store.componentSchemas, ([component]) => addToMapSet(component, componentObservers));
            (observe as any).resources = Object.fromEntries(
                Object.entries(store.resources).map(([resource]) => {
                    const archetype = store.ensureArchetype(resourceArchetypeComponents(resource));
                    const resourceId = archetype.columns.id.get(0);
                    return [resource, Observe.withMap(observeEntity(resourceId), (values) => (values as any)?.[resource] ?? null)];
                })
            );
            notifyAllObserversStoreReloaded();
            return observedDatabase as any;
        },
    };

    return observedDatabase;
}


