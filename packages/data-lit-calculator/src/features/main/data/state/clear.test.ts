// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./clear.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.clear", () => {
  for (const { name, after } of cases) {
    it(name, () => expectStateMatches(State.clear(), after));
  }
});
