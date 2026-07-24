// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./toggle-complete.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.toggleComplete", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.toggleComplete(before, args), after));
  }
});
