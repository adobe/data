// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./hop.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.hop", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.hop(before, args), after);
    });
  }
});
