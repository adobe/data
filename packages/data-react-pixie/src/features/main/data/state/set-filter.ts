// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../filter-kind/filter-kind.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

export const setFilter = <T extends Pick<State, "filter">>(
  state: T,
  input: { readonly filter: FilterKind },
): T => ({ ...state, filter: input.filter });

// Spec-owned cases, shared with the ecs `setFilter` transaction. Replaces the
// scene-wide filter; sprites are untouched.
export const cases: Conformance<typeof setFilter> = [
  {
    name: "sets the filter from none to sepia",
    before: { sprites: [], filter: "none" },
    args: { filter: "sepia" },
    after: { sprites: [], filter: "sepia" },
  },
  {
    name: "replaces an existing filter",
    before: { sprites: [], filter: "blur" },
    args: { filter: "night" },
    after: { sprites: [], filter: "night" },
  },
];
