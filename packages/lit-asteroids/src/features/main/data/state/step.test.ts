// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import { Input } from "../input/input.js";
import { cases } from "./step.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.step", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.step(before, args.dt, args.input), after);
    });
  }

  it("returns the same reference (not just an equal value) when the game is over", () => {
    const state = { ...State.create(), lives: 0 };
    expect(State.step(state, 0.016, Input.none)).toBe(state);
  });
});
