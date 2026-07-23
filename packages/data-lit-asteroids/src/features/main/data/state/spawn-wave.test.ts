// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Vec2 } from "@adobe/data/math";
import { State } from "./state.js";
import { cases } from "./spawn-wave.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.spawnWave", () => {
  for (const { name, before, after } of cases) {
    it(name, () => {
      expectStateMatches(State.spawnWave(before), after);
    });
  }

  it("grows the wave each time the field is cleared", () => {
    const bounds: Vec2 = [200, 200];
    const first = State.spawnWave({ ...State.create(), bounds, wave: 0 });
    const second = State.spawnWave({ ...State.create(), bounds, wave: 1 });
    expect(second.asteroids.length).toBeGreaterThan(first.asteroids.length);
  });
});
