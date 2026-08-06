// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../filter-kind/filter-kind.js";
import type { State } from "./state.js";

export const setFilter = <T extends Pick<State, "filter">>(
  state: T,
  input: { readonly filter: FilterKind },
): T => ({ ...state, filter: input.filter });
