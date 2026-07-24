// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Outcome SELECTION/DETECTION tests — a system concern the whole-tick conformance
// can't isolate, and where subtle bugs hide (which lane the frog is on, the exact
// coverage boundary, adjacent-lane hazards). Each case seeds an edge-case
// geometry, drives ONE frame with dt = 0 (so hazards don't move and the frog
// isn't carried — motion is an identity), and reads back the resulting `State`.
// This exercises the collision system's lane lookup + coverage narrow-phase in
// isolation from movement.
import { describe, it, expect } from "vitest";
import type { State } from "../../data/state/state.js";
import type { Lane } from "../../data/lane/lane.js";
import { createSystemDatabase } from "../conformance/create-system-database.js";
import { fromState } from "../conformance/from-state.js";
import { toState } from "../conformance/to-state.js";
import { driveFrame } from "../conformance/drive-frame.js";

const roadLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "road" },
  { row: 2, kind: "goal" },
];
const riverLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "river" },
  { row: 2, kind: "goal" },
];

const base = (overrides: Partial<State>): State => ({
  width: 5,
  height: 3,
  lanes: roadLanes,
  hazards: [],
  frog: { x: 2, y: 0 },
  lives: 3,
  score: 0,
  status: "playing",
  ...overrides,
});

// Seed the geometry, run exactly one selection-only frame (dt 0), project back.
const detect = (state: State): State => {
  const db = createSystemDatabase();
  fromState(db.store, state);
  db.store.resources.frameDelta = 0;
  driveFrame(db);
  return toState(db.store);
};

describe("outcome selection — road", () => {
  it("a car under the frog costs a life and respawns it", () => {
    const after = detect(
      base({
        frog: { x: 2, y: 1 },
        hazards: [{ kind: "car", lane: 1, x: 2, width: 1, velocity: 0 }],
      }),
    );
    expect(after.lives).toBe(2);
    expect(after.frog).toEqual({ x: 2, y: 0 });
    expect(after.status).toBe("playing");
  });

  it("a car on the frog's lane but not under it is safe", () => {
    const after = detect(
      base({
        frog: { x: 2, y: 1 },
        hazards: [{ kind: "car", lane: 1, x: 0, width: 1, velocity: 0 }],
      }),
    );
    expect(after.lives).toBe(3);
    expect(after.frog).toEqual({ x: 2, y: 1 });
  });

  it("the final life turns a hit into game over (no respawn)", () => {
    const after = detect(
      base({
        frog: { x: 2, y: 1 },
        hazards: [{ kind: "car", lane: 1, x: 2, width: 1, velocity: 0 }],
        lives: 1,
      }),
    );
    expect(after.lives).toBe(0);
    expect(after.status).toBe("gameOver");
    expect(after.frog).toEqual({ x: 2, y: 1 });
  });
});

describe("outcome selection — river", () => {
  it("a log under the frog is safe (ride)", () => {
    const after = detect(
      base({
        lanes: riverLanes,
        frog: { x: 2, y: 1 },
        hazards: [{ kind: "log", lane: 1, x: 0, width: 3, velocity: 0 }],
      }),
    );
    expect(after.lives).toBe(3);
    expect(after.frog).toEqual({ x: 2, y: 1 });
  });

  it("open water with no log drowns the frog", () => {
    const after = detect(base({ lanes: riverLanes, frog: { x: 2, y: 1 }, hazards: [] }));
    expect(after.lives).toBe(2);
    expect(after.frog).toEqual({ x: 2, y: 0 });
  });

  it("the log's exclusive right edge is open water (drown at the boundary)", () => {
    const after = detect(
      base({
        lanes: riverLanes,
        frog: { x: 3, y: 1 }, // log covers [0, 3); x = 3 is NOT covered
        hazards: [{ kind: "log", lane: 1, x: 0, width: 3, velocity: 0 }],
      }),
    );
    expect(after.lives).toBe(2);
  });
});

describe("outcome selection — terrain", () => {
  it("reaching the goal scores and wins", () => {
    const after = detect(base({ frog: { x: 2, y: 2 } }));
    expect(after.score).toBe(1);
    expect(after.status).toBe("won");
  });

  it("grass is always safe", () => {
    const after = detect(base({ frog: { x: 2, y: 0 } }));
    expect(after.lives).toBe(3);
    expect(after.score).toBe(0);
    expect(after.status).toBe("playing");
  });
});
