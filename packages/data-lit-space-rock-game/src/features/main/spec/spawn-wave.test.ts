// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import type { Asteroid } from "../data/values/asteroid/asteroid.js";
import { spawnWave } from "./spawn-wave.js";

// `spawnWave` seeds a fresh game's first wave; the `createInitial` cases pin its
// layout. These cover the wave bump and the no-op branch `createInitial` never reaches.
describe("spawnWave", () => {
  const field: State = { ...State.create(), bounds: [200, 200] };

  it("spawns the next wave of large asteroids when the field is clear", () => {
    const { wave, entities } = spawnWave({ ...field, wave: 1 });
    expect(wave).toBe(2);
    expect([...entities.values()].map((a) => "size" in a && a.size)).toEqual(Array(5).fill("large"));
  });

  it("does nothing while asteroids still remain", () => {
    const rock: Asteroid = { position: [10, 10], velocity: [0, 0], size: "large" };
    const entities = new Map([[1, rock]]);
    expect(spawnWave({ ...field, wave: 1, entities })).toEqual({ wave: 1, entities });
  });
});
