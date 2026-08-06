// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { FilterKind } from "../filter-kind/filter-kind.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly filter: FilterKind };

// Replaces the scene-wide filter; sprites are untouched.
export const cases: readonly ConformanceCase<Args>[] = [
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

describe("State.setFilter", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.setFilter(before, args), after));
  }
});
