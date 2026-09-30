// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The `waves` system draws from the real random source, so its drift speeds can't be
// compared with the spec. A driven frame over a cleared field must still refill it
// with the fixed ring of four large asteroids and bump the wave: positions are
// deterministic (only speed is random), so assert those and the count.
import { describe, it, expect } from "vitest";
import { State } from "../../spec/state.js";
import { Ship } from "../../data/values/ship/ship.js";
import { Asteroid } from "../../data/values/asteroid/asteroid.js";
import { Input } from "../../data/values/input/input.js";
import { createSystemDatabase } from "./create-system-database.js";
import { projection } from "./projection.js";
import { driveFrame } from "./drive-frame.js";

describe("waves system", () => {
  it("refills a cleared field with the large-asteroid ring", () => {
    const db = createSystemDatabase();
    projection.fromState(db.store, {
      ...State.create(),
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      entities: new Map(),
      wave: 0,
    });
    db.store.resources.frameDelta = 0.1;
    db.transactions.setInput(Input.none);
    driveFrame(db);

    const after = projection.toState(db.store);
    const asteroids = [...after.entities.values()].filter(Asteroid.is);
    expect(after.wave).toBe(1);
    expect(asteroids.length).toBe(4);
    expect(asteroids.every((a) => a.size === "large")).toBe(true);
    const positions = asteroids.map((a) => [
      Math.round(a.position[0]),
      Math.round(a.position[1]),
    ]);
    expect(positions).toEqual(
      expect.arrayContaining([
        [180, 100],
        [100, 180],
        [20, 100],
        [100, 20],
      ]),
    );
  });
});
