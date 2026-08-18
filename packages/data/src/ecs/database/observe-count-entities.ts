// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { StringKeyof } from "../../types/types.js";
import { RequiredComponents } from "../required-components.js";
import { OptionalComponents, ReadonlyStore } from "../index.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";
import { canonicalSelectKey } from "./observe-select-entities.js";

/**
 * The reactive counterpart of `store.count` — mirrors `observeSelectEntities` but emits the
 * entity COUNT (a number) instead of an entity array, so a count-only consumer allocates no
 * array on every change.
 *
 * On any commit that touches an `include`/`exclude` component it recomputes
 * `store.count(include, options)` — cheap: a sum of matched archetype row counts — and emits
 * only when the value actually changed. Unlike `observe.select` it keeps no per-entity
 * membership set: ordering is irrelevant to a count, and a recompute that finds the same count
 * (e.g. a value-only change on a member) is dropped by the value dedupe rather than avoided by
 * a membership diff. Keyed identically to `observe.select` so equal queries share one Observe.
 */
export const observeCountEntities = <C extends object>(store: ReadonlyStore<C, any, any>, observeTransactions: Observe<TransactionResult<C>>) => {
    const cachedCountObserveFunctions = new Map<string, Observe<number>>();

    const createCountObserveFunction = <Include extends StringKeyof<C>>(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ): Observe<number> => {
        return (observer: (count: number) => void) => {
            const includeSet = new Set<string>(include);
            const excludeSet = new Set<string>(options?.exclude ?? []);
            let isMicrotaskQueued = false;
            let hasEmitted = false;
            let currentCount = 0;

            const notifyObserver = () => {
                isMicrotaskQueued = false;
                const count = store.count(include, options);
                if (!hasEmitted || count !== currentCount) {
                    hasEmitted = true;
                    currentCount = count;
                    observer(count);
                }
            };

            const unobserveTransactions = observeTransactions(t => {
                if (t.changedComponents.isDisjointFrom(includeSet) && t.changedComponents.isDisjointFrom(excludeSet)) {
                    // No selected or excluded component changed, so membership — and thus the count —
                    // cannot have changed. (`where` keys are a subset of `include`, so a filter-value
                    // change is already covered by the include test.)
                    return;
                }
                if (!isMicrotaskQueued) {
                    isMicrotaskQueued = true;
                    queueMicrotask(notifyObserver);
                }
            });

            notifyObserver();

            return () => {
                unobserveTransactions();
            };
        };
    };

    return <Include extends StringKeyof<C>>(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ) => {
        const key = canonicalSelectKey(include, options);
        let observeFunction = cachedCountObserveFunctions.get(key);
        if (!observeFunction) {
            observeFunction = Observe.withCache(createCountObserveFunction(include, options));
            cachedCountObserveFunctions.set(key, observeFunction);
        }
        return observeFunction;
    };
};
