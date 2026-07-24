// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.create", () => {
  it("is a blank neutral state: no field, idle ship, empty, full lives, wave 0", () => {
    const state = State.create();
    expect(state.bounds).toEqual([0, 0]);
    expect(state.ship.velocity).toEqual([0, 0]);
    expect(state.bullets).toEqual([]);
    expect(state.asteroids).toEqual([]);
    expect(state.score).toBe(0);
    expect(state.lives).toBe(3);
    expect(state.wave).toBe(0);
  });

  it("is not game over", () => {
    expect(State.isGameOver(State.create())).toBe(false);
  });
});
