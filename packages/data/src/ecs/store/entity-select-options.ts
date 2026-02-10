// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Filter } from "../../table/select-rows.js";
import { ArchetypeQueryOptions } from "./core/core.js";

export type OrderClause<T extends object> = { [K in keyof T]?: boolean };

export type EntitySelectOptions<
    C extends object,
    T extends object,
> = ArchetypeQueryOptions<C> & {
    /**
     * Filter the results by the given condition using a declarative where clause.
     */
    where?: Filter<T>;
    /**
     * Order results by the given components ascending or descending.
     */
    order?: OrderClause<T>;
}