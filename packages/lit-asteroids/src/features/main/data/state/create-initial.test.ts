// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./create-initial.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.createInitial", () => {
  for (const { name, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.createInitial(args), after);
    });
  }
});
