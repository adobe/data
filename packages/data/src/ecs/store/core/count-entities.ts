// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getRowPredicateFromFilter } from "../../../table/select-rows.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { EntitySelectOptions } from "../entity-select-options.js";
import { Core } from "./core.js";
import { OptionalComponents } from "../../optional-components.js";

/**
 * Count the entities matching `include` (minus `exclude`), applying an optional row
 * `where` filter — the count-only counterpart of `selectEntities` in the same folder.
 *
 * Ordering is meaningless to a count, so there is no `order` handling. For the common
 * no-`where` case the count is the sum of each matched archetype's `rowCount` (via
 * `queryArchetypes`): O(matched archetypes), and — unlike `select` — it allocates no
 * entity array. With a `where` filter it counts matching rows through the row predicate
 * without collecting their ids.
 */
export const countEntities = <
    C extends object,
    Include extends StringKeyof<C & OptionalComponents>
>(
    core: Core<C>,
    include: readonly Include[] | ReadonlySet<string>,
    options?: EntitySelectOptions<C & RequiredComponents, Pick<C & RequiredComponents & OptionalComponents, Include>>
): number => {
    // Only `exclude` is an archetype-level option; `where` is a row-level filter applied below.
    const archetypes = core.queryArchetypes(include, options?.exclude ? { exclude: options.exclude } : undefined);
    if (!options?.where) {
        let count = 0;
        for (const archetype of archetypes) {
            count += archetype.rowCount;
        }
        return count;
    }
    const predicate = getRowPredicateFromFilter(options.where);
    let count = 0;
    for (const archetype of archetypes) {
        // `queryArchetypes` guarantees each archetype carries every `include` column, and
        // `where` keys are a subset of `include`, so the predicate reads present columns.
        const table = archetype as unknown as Parameters<typeof predicate>[0];
        for (let row = 0; row < archetype.rowCount; row++) {
            if (predicate(table, row)) count++;
        }
    }
    return count;
};
