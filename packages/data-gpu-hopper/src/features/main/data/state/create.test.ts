// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import { LaneKind } from "../lane-kind/lane-kind.js";

describe("State.create", () => {
  const state = State.create();

  it("starts in play with three lives and no score", () => {
    expect(state.status).toBe("playing");
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
  });

  it("spawns the frog centred on the bottom row", () => {
    expect(state.frog).toEqual(State.startPosition(state));
    expect(state.frog.y).toBe(0);
  });

  it("has a lane for every row of the board", () => {
    for (let row = 0; row < state.height; row++) {
      expect(State.laneAt(state, row)).toBeDefined();
    }
  });

  it("places cars only on roads and logs only on rivers", () => {
    for (const hazard of state.hazards) {
      const kind = State.laneAt(state, hazard.lane)?.kind;
      const expected = hazard.kind === "car" ? "road" : "river";
      expect(kind).toBe(expected);
    }
  });

  it("gives every moving lane at least one hazard", () => {
    const carrying = new Set(["road", "river"]);
    for (const lane of state.lanes) {
      if (!carrying.has(lane.kind)) continue;
      const populated = state.hazards.some((hazard) => hazard.lane === lane.row);
      expect(populated, `lane ${lane.row} (${lane.kind}) has no hazard`).toBe(true);
    }
  });

  it("colours every terrain kind used by the board", () => {
    for (const lane of state.lanes) {
      expect(LaneKind.laneColor[lane.kind]).toHaveLength(4);
    }
  });
});
