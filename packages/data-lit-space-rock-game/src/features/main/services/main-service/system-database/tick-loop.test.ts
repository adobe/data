// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Whole-tick conformance: one frame of the ECS system loop must produce the
// same logical `State` as one `data/` `State.step`. Reuses the feature
// projection (`ecs/conformance/`) over the SHARED `step` cases — the same
// `{ before, args, after }` array the pure `State.step` spec test runs — so
// this is "substitute the implementation, reuse the truth".
//
// Systems run through `db.system.functions`, so unlike a transaction they need
// the assembled database, obtained cast-free via `createSystemDatabase` (the
// writable-store lens). Per case: seed `fromState(db.store, before)`, seed the
// fixed-timestep `frameDelta` (a resource with no `data/` analogue, written
// straight to the store as the oracle is fed `args.dt`) and the player `input`,
// drive one headless frame, then assert `toState(db.store) ≡ after`. Each case
// also asserts `State.step ≡ after` first, keeping the shared case honest.
//
// None of the shared cases clears the field, so neither the oracle nor the
// `waves` system draws randomness — the injected `random` double is inert here
// and both sides stay exact. The randomized refill (whose real `Math.random`
// source can't be shared with the pure oracle frame-for-frame) is covered
// out-of-band: `spawn-random-wave.test.ts` (transition), the `spawnRandomWave`
// transaction conformance (ecs mutation), and the detection test below (the
// `waves` system actually refilling a cleared field).
import { describe, it, expect } from "vitest";
import { State } from "../../../data/state/state.js";
import { Ship } from "../../../data/ship/ship.js";
import { Input } from "../../../data/input/input.js";
import { cases } from "../../../data/state/step.cases.js";
import { expectStateMatches } from "../../../data/state/expect-state-matches.js";
import { RandomService } from "../../random-service/random-service.js";
import { createSystemDatabase } from "../conformance/create-system-database.js";
import { fromState } from "../conformance/from-state.js";
import { toState } from "../conformance/to-state.js";
import { driveFrame } from "../conformance/drive-frame.js";

describe("ECS system tick loop conforms to State.step (one frame = one step)", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      const { dt, input } = testCase.args;
      expectStateMatches(
        State.step(testCase.before, dt, input, { random: RandomService.createFake() }),
        testCase.after,
      );

      const db = createSystemDatabase();
      fromState(db.store, testCase.before);
      db.store.resources.frameDelta = dt;
      db.transactions.setInput(input);
      driveFrame(db);
      expectStateMatches(toState(db.store), testCase.after);
    });
  }

  // The `waves` system uses the REAL random source, so its drift speeds vary and
  // can't be asserted against the pure oracle. Detection-style check instead: a
  // driven frame over a cleared field must refill it with the fixed ring of four
  // large asteroids and bump the wave — positions are deterministic (only speed
  // is random), so assert those and the count, not the velocities.
  it("waves system refills a cleared field with the large-asteroid ring", () => {
    const db = createSystemDatabase();
    fromState(db.store, {
      ...State.create(),
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      asteroids: [],
      wave: 0,
    });
    db.store.resources.frameDelta = 0.1;
    db.transactions.setInput(Input.none);
    driveFrame(db);

    const after = toState(db.store);
    expect(after.wave).toBe(1);
    expect(after.asteroids).toHaveLength(4);
    expect(after.asteroids.every((a) => a.size === "large")).toBe(true);
    const positions = after.asteroids.map((a) => [
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
