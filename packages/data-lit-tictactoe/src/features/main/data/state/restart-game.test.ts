// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./restart-game.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.restartGame", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.restartGame(before), after);
    });
  }
});
