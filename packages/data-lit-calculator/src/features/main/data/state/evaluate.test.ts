// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./evaluate.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.evaluate", () => {
  for (const { name, before, after } of cases) {
    it(name, () => expectStateMatches(State.evaluate(before), after));
  }
});
