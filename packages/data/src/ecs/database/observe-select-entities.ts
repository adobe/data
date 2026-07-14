// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { getRowPredicateFromFilter } from "../../table/select-rows.js";
import { StringKeyof } from "../../types/types.js";
import { RequiredComponents } from "../required-components.js";
import { Entity } from "../entity/entity.js";
import { OptionalComponents, ReadonlyStore } from "../index.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";

export const observeSelectEntities = <C extends object>(store: ReadonlyStore<C, any, any>, observeTransactions: Observe<TransactionResult<C>>) => {
    const cachedSelectObserveFunctions = new Map<string, Observe<readonly Entity[]>>();

    const createSelectObserveFunction = <Include extends StringKeyof<C>>(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ): Observe<readonly Entity[]> => {
        return (observer: (entities: readonly Entity[]) => void) => {
            const includeSet = new Set<string>(include);
            const whereSet = new Set(Object.keys(options?.where ?? {}) as StringKeyof<C>[]);
            const orderSet = new Set(Object.keys(options?.order ?? {}) as StringKeyof<C>[]);
            let isMicrotaskQueued = false;
            let currentEntities: Set<Entity> | null = null;
            const rowPredicate = getRowPredicateFromFilter(options?.where);

            const notifyObsever = () => {
                // we just do a full select here.
                // later we will optimize this, since this algorithm is O(n)
                const entities = store.select(include, options);
                currentEntities = new Set(entities);
                observer(entities);
                isMicrotaskQueued = false;
            }

            const unobserveTransactions = observeTransactions(t => {
                if (t.changedComponents.isDisjointFrom(includeSet)) {
                    // no components in the changed set are in the include set
                    // so we don't need to notify the observer. there is no possible change.
                    return;
                }

                if (currentEntities) {
                    let needsUpdate = false;
                    for (const entity of t.changedEntities.keys()) {
                        if (currentEntities.has(entity)) {
                            const changedEntityValues = t.changedEntities.get(entity);
                            if (!changedEntityValues) {
                                // entity delete => update
                                needsUpdate = true;
                                break;
                            }
                            const changedComponentSet = new Set(Object.keys(changedEntityValues) as StringKeyof<C>[]);
                            if (!changedComponentSet.isDisjointFrom(orderSet)) {
                                // entity order components changed => update
                                needsUpdate = true;
                                break;
                            }
                            if (!includeSet.isDisjointFrom(changedComponentSet)) {
                                // An include component changed for this entity (whereSet is a
                                // subset of includeSet, so where changes are covered here too).
                                // The change may have migrated the row out of the result set by
                                // removing a required component, so re-derive membership from the
                                // authoritative store rather than assuming the entity is still a
                                // member. This is the symmetric counterpart to the entry check
                                // below, and keeps us O(changes): at most one O(1) locate per
                                // changed entity, no scan of the result set.
                                const location = store.locate(entity);
                                if (!location || !location.archetype.components.isSupersetOf(includeSet)) {
                                    // entity has left the result set (membership contraction)
                                    needsUpdate = true;
                                    break;
                                }
                                if (!changedComponentSet.isDisjointFrom(whereSet) && !rowPredicate(location.archetype as any, location.row)) {
                                    // a where component changed and the entity no longer matches the filter
                                    needsUpdate = true;
                                    break;
                                }
                            }
                        }
                        else {
                            // this entity is not in the set, we need to check it would be added to the result set.
                            const location = store.locate(entity);
                            if (location) {
                                const { archetype, row } = location;
                                if (archetype.components.isSupersetOf(includeSet)) {
                                    if (rowPredicate(archetype as any, row)) {
                                        // this entity would be in the result set.
                                        needsUpdate = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if (!needsUpdate) {
                        // early exit, we don't need to requery
                        // because we are certain the entities and order could not have changed.
                        return;
                    }
                }

                if (!isMicrotaskQueued) {
                    isMicrotaskQueued = true;
                    queueMicrotask(notifyObsever);
                }
            });

            notifyObsever();

            return () => {
                unobserveTransactions();
            }
        }
    }

    return <Include extends StringKeyof<C>>(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ) => {
        const key = JSON.stringify({ include, options });
        let observeFunction = cachedSelectObserveFunctions.get(key);
        if (!observeFunction) {
            observeFunction = Observe.withCache(createSelectObserveFunction(include, options));
            cachedSelectObserveFunctions.set(key, observeFunction);
        }
        return observeFunction;
    }
}