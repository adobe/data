// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Collision SELECTION/DETECTION tests — a system concern the whole-tick
// conformance can't isolate, and where subtle broad-phase bugs hide. Each case
// seeds an edge-case geometry, drives ONE frame with dt = 0 (so nothing moves
// or ages — advance/wrap are identities, no bullet expires, no fire), and reads
// back which entities actually interacted. This exercises the `byCell`
// computed-key broad phase + the circle narrow-phase in isolation from motion.
//
// The broad phase must union a 3×3 block of cells (cellSize = 80), so the key
// cases put an overlapping pair in DIFFERENT cells, and a non-overlapping pair
// where a naive same-cell test might false-positive / false-negative.
import { describe, it, expect } from "vitest";
import type { State } from "../../data/state/state.js";
import { Ship } from "../../data/ship/ship.js";
import { Input } from "../../data/input/input.js";
import { Size } from "../../data/size/size.js";
import { createSystemDatabase } from "../conformance/create-system-database.js";
import { fromState } from "../conformance/from-state.js";
import { toState } from "../conformance/to-state.js";
import { driveFrame } from "../conformance/drive-frame.js";

const base = (overrides: Partial<State>): State => ({
  bounds: [800, 600],
  ship: Ship.spawn([750, 550]), // far corner — no ship strike unless overridden
  bullets: [],
  asteroids: [],
  score: 0,
  lives: 3,
  wave: 1,
  ...overrides,
});

// Seed the geometry, run exactly one detection-only frame (dt 0), project back.
const detect = (state: State): State => {
  const db = createSystemDatabase();
  fromState(db.store, state);
  db.store.resources.frameDelta = 0;
  db.transactions.setInput(Input.none);
  driveFrame(db);
  return toState(db.store);
};

describe("collision detection — bullet ↔ asteroid selection", () => {
  it("destroys only the asteroid the bullet overlaps, scoring it", () => {
    const after = detect(
      base({
        bullets: [{ position: [100, 100], velocity: [0, 0], age: 0 }],
        asteroids: [
          { position: [100, 100], velocity: [0, 0], size: "large" }, // overlapped
          { position: [400, 300], velocity: [0, 0], size: "large" }, // far away
        ],
      }),
    );
    expect(after.score).toBe(Size.score.large);
    expect(after.bullets).toHaveLength(0);
    // The struck large became two mediums; the distant large is untouched.
    expect(after.asteroids.filter((a) => a.size === "medium")).toHaveLength(2);
    expect(after.asteroids.filter((a) => a.size === "large")).toHaveLength(1);
  });

  it("registers a hit across a cell boundary (broad phase unions neighbours)", () => {
    // Bullet in cell x=0 (79/80), asteroid centre in cell x=1 (81/80); they are
    // 2px apart, well within 2+40, so a correct 3×3 neighbour union finds it.
    const after = detect(
      base({
        bullets: [{ position: [79, 100], velocity: [0, 0], age: 0 }],
        asteroids: [{ position: [81, 100], velocity: [0, 0], size: "large" }],
      }),
    );
    expect(after.score).toBe(Size.score.large);
    expect(after.bullets).toHaveLength(0);
  });

  it("registers a hit exactly at the radius-sum boundary (distance == r₁+r₂)", () => {
    const after = detect(
      base({
        bullets: [{ position: [0, 0], velocity: [0, 0], age: 0 }],
        asteroids: [{ position: [42, 0], velocity: [0, 0], size: "large" }], // 42 == 2+40
      }),
    );
    expect(after.score).toBe(Size.score.large);
    expect(after.bullets).toHaveLength(0);
  });

  it("does NOT register just beyond the radius sum (no false positive)", () => {
    const after = detect(
      base({
        bullets: [{ position: [0, 0], velocity: [0, 0], age: 0 }],
        asteroids: [{ position: [43, 0], velocity: [0, 0], size: "large" }], // 43 > 42
      }),
    );
    expect(after.score).toBe(0);
    expect(after.bullets).toHaveLength(1);
    expect(after.asteroids).toHaveLength(1);
    expect(after.asteroids[0].size).toBe("large");
  });

  it("leaves a bullet that overlaps nothing untouched", () => {
    const after = detect(
      base({
        bullets: [{ position: [10, 10], velocity: [0, 0], age: 0 }],
        asteroids: [{ position: [400, 300], velocity: [0, 0], size: "large" }],
      }),
    );
    expect(after.score).toBe(0);
    expect(after.bullets).toHaveLength(1);
    expect(after.asteroids).toHaveLength(1);
  });
});

describe("collision detection — ship ↔ asteroid selection", () => {
  it("costs a life when an asteroid overlaps the ship", () => {
    const after = detect(
      base({
        ship: Ship.spawn([400, 300]),
        asteroids: [{ position: [400, 300], velocity: [0, 0], size: "large" }],
        lives: 3,
      }),
    );
    expect(after.lives).toBe(2);
    expect(after.ship.position).toEqual([400, 300]); // respawned at the centre
  });

  it("spends exactly one life even when several asteroids touch the ship", () => {
    const after = detect(
      base({
        ship: Ship.spawn([400, 300]),
        asteroids: [
          { position: [400, 300], velocity: [0, 0], size: "large" },
          { position: [410, 300], velocity: [0, 0], size: "large" },
        ],
        lives: 3,
      }),
    );
    expect(after.lives).toBe(2);
  });

  it("does not cost a life when the nearest asteroid is out of range", () => {
    const after = detect(
      base({
        ship: Ship.spawn([400, 300]),
        asteroids: [{ position: [460, 300], velocity: [0, 0], size: "large" }], // 60 > 52
        lives: 3,
      }),
    );
    expect(after.lives).toBe(3);
    expect(after.ship.position).toEqual([400, 300]);
  });
});
