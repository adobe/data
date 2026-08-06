// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../../../../data/filter-kind/filter-kind.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

export const setFilter = (t: CoreDatabase.Store, args: { readonly filter: FilterKind }) => {
  t.resources.filter = args.filter;
};
