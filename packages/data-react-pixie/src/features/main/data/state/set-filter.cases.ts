// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setFilter } from "./set-filter.js";

// Inert, spec-owned cases for `setFilter`, shared with the ecs transaction. The
// scene-wide filter is replaced; sprites are untouched.
export const cases: Conformance.SpecCases<State, typeof setFilter> = {
  cases: [
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
  ],
};
