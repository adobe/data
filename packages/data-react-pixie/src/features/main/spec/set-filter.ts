// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../data/values/filter-kind/filter-kind.js";
import type { State } from "./state.js";

// Replace the scene-wide filter. Writes only `filter`; sprites are untouched.
export const setFilter = (
  _state: Pick<State, "filter">,
  input: { readonly filter: FilterKind },
): Pick<State, "filter"> => ({ filter: input.filter });
