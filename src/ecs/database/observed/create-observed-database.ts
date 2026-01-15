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
import { observeSelectEntities } from "../observe-select-entities.js";
import { createTransactionalStore } from "../transactional-store/create-transactional-store.js";
import { RequiredComponents } from "../../required-components.js";
import { Entity } from "../../entity.js";
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
        const result = transactionalExecute(
            handler as (db: Store<C, R, A>) => Entity | void,
            options,
        );
        notifyObservers(result);
        return result;
    };

    const observeEntity = <T extends RequiredComponents>(entity: Entity, minArchetype?: ReadonlyArchetype<T> | Archetype<T>) => (observer: (values: EntityReadValues<C> | null) => void) => {
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

    const observeResource = Object.fromEntries(
        Object.entries(store.resources).map(([resource]) => {
            const archetype = store.ensureArchetype(["id" as StringKeyof<C>, resource as unknown as StringKeyof<C>]);
            const resourceId = archetype.columns.id.get(0);
            return [resource, Observe.withMap(observeEntity(resourceId), (values) => values?.[resource as unknown as StringKeyof<C>] ?? null)];
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
                const values = store.read(entity);
                let updateValues: EntityUpdateValues<C> | null = null;
                if (values) {
                    const { id, ...restValues } = values;
                    updateValues = restValues as EntityUpdateValues<C>;
                }
                return [
                    entity,
                    updateValues
                ];
            })),
            transient: false,
            value: undefined,
            undo: [],
            redo: [],
            undoable: null,
        };
        notifyObservers(notifyResult);
    };

    const observedDatabase: ObservedDatabase<C, R, A> = {
        ...rest,
        resources,
        observe,
        execute,
        toData: () => store.toData(),
        fromData: (data: unknown) => {
            store.fromData(data);
            notifyAllObserversStoreReloaded();
        },
        extend: (plugin: any) => {
            transactionalStore.extend(plugin);
            notifyAllObserversStoreReloaded();
            return observedDatabase as any;
        },
    };

    return observedDatabase;
}


