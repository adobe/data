// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { cases } from "./fire-bullet.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.fireBullet", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.fireBullet(before), after);
    });
  }
});
