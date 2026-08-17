// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../filter-kind/filter-kind.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";

// Replace the scene-wide filter. Writes only `filter`; sprites are untouched.
export const setFilter = (
  _state: Pick<State, "filter">,
  input: { readonly filter: FilterKind },
): Pick<State, "filter"> => ({ filter: input.filter });

// Spec-owned cases, shared with the ecs `setFilter` transaction.
export const cases = Conformance.cases(setFilter,
  {
    name: "sets the filter from none to sepia",
    before: {},
    args: { filter: "sepia" },
    after: { filter: "sepia" },
  },
  {
    name: "replaces an existing filter",
    before: { filter: "blur" },
    args: { filter: "night" },
    after: { filter: "night" },
  },
);
