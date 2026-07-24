// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import type { State as StateType } from "./state.js";
import type { Lane } from "../lane/lane.js";
import type { Hazard } from "../hazard/hazard.js";

const lanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "road" },
  { row: 2, kind: "river" },
  { row: 3, kind: "goal" },
];

const board = (hazards: readonly Hazard[], x: number, y: number): StateType => ({
  width: 5, height: 4, lanes, hazards, frog: { x, y }, lives: 3, score: 0, status: "playing",
});

const car: Hazard = { kind: "car", lane: 1, x: 2, width: 1, velocity: 1 };
const log: Hazard = { kind: "log", lane: 2, x: 0, width: 3, velocity: 1 };

describe("State.frogOutcome", () => {
  it("is safe on grass", () => {
    expect(State.frogOutcome(board([], 2, 0))).toBe("safe");
  });
  it("is safe on an empty road tile", () => {
    expect(State.frogOutcome(board([car], 0, 1))).toBe("safe");
  });
  it("collides with a car on the road", () => {
    expect(State.frogOutcome(board([car], 2, 1))).toBe("collide");
  });
  it("drowns over open water", () => {
    expect(State.frogOutcome(board([log], 4, 2))).toBe("drown");
  });
  it("rides a log on the river", () => {
    expect(State.frogOutcome(board([log], 1, 2))).toBe("ride");
  });
  it("drowns when carried off the board edge even while over a log", () => {
    expect(State.frogOutcome(board([{ ...log, x: 4, width: 3 }], 5.2, 2))).toBe("drown");
  });
  it("wins on the goal row", () => {
    expect(State.frogOutcome(board([], 2, 3))).toBe("win");
  });
});
