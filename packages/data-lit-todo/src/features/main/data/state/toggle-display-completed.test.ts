// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./toggle-display-completed.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.toggleDisplayCompleted", () => {
  for (const { name, before, after } of cases) {
    it(name, () => expectStateMatches(State.toggleDisplayCompleted(before), after));
  }
});
