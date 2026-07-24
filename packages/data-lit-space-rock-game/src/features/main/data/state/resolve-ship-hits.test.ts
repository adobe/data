// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./resolve-ship-hits.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.resolveShipHits", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.resolveShipHits(before), after);
    });
  }
});
