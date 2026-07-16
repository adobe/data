// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Filter } from "../../table/select-rows.js";
import { ArchetypeQueryOptions } from "./core/core.js";

export type OrderClause<T extends object> = { [K in keyof T]?: boolean };

export type EntitySelectOptions<
    C extends object,
    T extends object,
> = Omit<ArchetypeQueryOptions<C>, "where"> & {
    /**
     * Filter the results by the given condition using a declarative where clause.
     * This is a *row-level* {@link Filter} (supports comparison operators),
     * distinct from `ArchetypeQueryOptions.where`, which is archetype-level
     * partition-value equality. Select owns row filtering, so it replaces the
     * inherited partition `where` rather than intersecting with it.
     */
    where?: Filter<T>;
    /**
     * Order results by the given components ascending or descending.
     */
    order?: OrderClause<T>;
}