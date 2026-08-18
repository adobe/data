// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { getRowPredicateFromFilter } from "../../table/select-rows.js";
import { StringKeyof } from "../../types/types.js";
import { RequiredComponents } from "../required-components.js";
import { Entity } from "../entity/entity.js";
import { ArchetypeId, ReadonlyArchetype } from "../archetype/index.js";
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
            const excludeSet = new Set<string>(options?.exclude ?? []);
            const whereSet = new Set(Object.keys(options?.where ?? {}) as StringKeyof<C>[]);
            const orderSet = new Set(Object.keys(options?.order ?? {}) as StringKeyof<C>[]);
            let isMicrotaskQueued = false;
            let currentEntities: Set<Entity> | null = null;
            const rowPredicate = getRowPredicateFromFilter(options?.where);
            // Callers only reach this after `qualifies` has confirmed the archetype's
            // components are a superset of `include`, and `where` keys are a subset of
            // `include`, so the archetype carries every column the predicate reads.
            // `store.locate` only types the base `id` column, so assert the fuller table
            // shape the predicate expects (narrower than `as any`).
            const matchesFilter = (archetype: ReadonlyArchetype, row: number) =>
                rowPredicate(archetype as Parameters<typeof rowPredicate>[0], row);

            // Whether an archetype qualifies for this query — its components are a
            // superset of `include` and disjoint from `exclude` — is a pure function of
            // the archetype's component set, which never changes once created, and
            // archetype ids are stable and densely assigned. Memoize the verdict by id
            // so the per-entity membership test is an O(1) map lookup rather than an
            // O(|include|) superset scan: each archetype is classified at most once per
            // subscription, and archetypes created later are classified on first sight.
            const archetypeQualifies = new Map<ArchetypeId, boolean>();
            const qualifies = (archetype: ReadonlyArchetype): boolean => {
                let verdict = archetypeQualifies.get(archetype.id);
                if (verdict === undefined) {
                    verdict = archetype.components.isSupersetOf(includeSet)
                        && (excludeSet.size === 0 || archetype.components.isDisjointFrom(excludeSet));
                    archetypeQualifies.set(archetype.id, verdict);
                }
                return verdict;
            };

            const notifyObsever = () => {
                // we just do a full select here.
                // later we will optimize this, since this algorithm is O(n)
                const entities = store.select(include, options);
                currentEntities = new Set(entities);
                observer(entities);
                isMicrotaskQueued = false;
            }

            const unobserveTransactions = observeTransactions(t => {
                if (t.changedComponents.isDisjointFrom(includeSet) && t.changedComponents.isDisjointFrom(excludeSet)) {
                    // No changed component is selected or excluded. An entity can only
                    // enter or leave the result set by gaining/losing an `include`
                    // component or gaining/losing an `exclude` component, and `order`/
                    // `where` keys are a subset of `include`, so neither the membership,
                    // the ordering, nor the filter outcome can have changed. (When there
                    // is no exclude clause `excludeSet` is empty and this extra test is a
                    // free O(1) `isDisjointFrom(∅)`.)
                    return;
                }

                if (currentEntities) {
                    let needsUpdate = false;
                    for (const entity of t.changedEntities.keys()) {
                        const inSet = currentEntities.has(entity);
                        const changedEntityValues = t.changedEntities.get(entity);
                        if (!changedEntityValues) {
                            // hard delete: only matters if the entity was in the set.
                            if (inSet) {
                                needsUpdate = true;
                                break;
                            }
                            continue;
                        }
                        const changedComponentSet = new Set(Object.keys(changedEntityValues) as StringKeyof<C>[]);
                        if (inSet && !changedComponentSet.isDisjointFrom(orderSet)) {
                            // An order-key changed for a member. Whether the row stays a
                            // member (its sort value moved) or left the set, the result must
                            // be requeried — so short-circuit before the otherwise-needless
                            // locate. (`order` keys are a subset of `include`, so for a
                            // non-member this same change is instead an entry candidate,
                            // handled by the membership test below.)
                            needsUpdate = true;
                            break;
                        }
                        if (includeSet.isDisjointFrom(changedComponentSet) && excludeSet.isDisjointFrom(changedComponentSet)) {
                            // No selected or excluded component changed for this entity, so
                            // its membership is unchanged and — for an in-set row — its
                            // filter value is unchanged too (`where` keys are a subset of
                            // `include`).
                            continue;
                        }
                        // A selected or excluded component changed for this entity; re-derive
                        // its membership from the authoritative store: one O(1) locate plus a
                        // memoized O(1) qualification lookup, no scan of the result set.
                        const location = store.locate(entity);
                        if (inSet) {
                            if (location === null || !qualifies(location.archetype)) {
                                // entity left the result set (deleted or migrated out —
                                // e.g. a required component was removed).
                                needsUpdate = true;
                                break;
                            }
                            if (!changedComponentSet.isDisjointFrom(whereSet) && !matchesFilter(location.archetype, location.row)) {
                                // a filter value changed and the row no longer matches.
                                needsUpdate = true;
                                break;
                            }
                        } else if (location !== null && qualifies(location.archetype) && matchesFilter(location.archetype, location.row)) {
                            // entity entered the result set.
                            needsUpdate = true;
                            break;
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
        const key = canonicalSelectKey(include, options);
        let observeFunction = cachedSelectObserveFunctions.get(key);
        if (!observeFunction) {
            observeFunction = Observe.withCache(createSelectObserveFunction(include, options));
            cachedSelectObserveFunctions.set(key, observeFunction);
        }
        return observeFunction;
    }
}

// Segment/element delimiters. Component names are schema keys (identifiers), so
// these control chars cannot occur inside one, making the key unambiguous.
const SECTION = "\u0001";
const ELEMENT = "\u0000";

/**
 * Canonical string key for a `(include, options)` query so semantically-equal
 * queries share one cached Observe.
 *
 * Not `JSON.stringify({ include, options })`: a `Set` (the shape of
 * `archetype.components`) serializes to `"{}"`, collapsing every set-based
 * select onto one key. Not a WeakMap identity cache either: it would only help
 * stable references and measurably pessimizes fresh-literal callers, on a
 * subscription-setup path where absolute cost is already sub-microsecond.
 *
 * `include`/`exclude` are set-like (sorted, so order and array-vs-Set don't
 * matter); `where` is a conjunction (keys sorted, values JSON-serialized);
 * `order` is a sort-priority sequence (preserved as written).
 */
export const canonicalSelectKey = <C extends object, T extends object>(
    include: readonly string[] | ReadonlySet<string>,
    options?: EntitySelectOptions<C, T>,
): string => {
    let key = [...include].sort().join(ELEMENT);
    if (!options) return key;
    if (options.exclude && options.exclude.length > 0) {
        key += SECTION + "x" + [...options.exclude].sort().join(ELEMENT);
    }
    if (options.where) {
        const parts = Object.entries(options.where)
            .map(([k, v]) => k + "=" + JSON.stringify(v))
            .sort();
        if (parts.length > 0) key += SECTION + "w" + parts.join(ELEMENT);
    }
    if (options.order) {
        const parts = Object.entries(options.order)
            .map(([k, v]) => k + "=" + (v ? "1" : "0"));
        if (parts.length > 0) key += SECTION + "o" + parts.join(ELEMENT);
    }
    return key;
};