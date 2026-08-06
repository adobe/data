// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";
import { Ship } from "../ship/ship.js";
import { Input } from "../input/input.js";
import { RandomService } from "../../services/random-service/random-service.js";
import { cases } from "./step.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

describe("State.step", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      // None of the shared cases clears the field, so `random` is never drawn;
      // a fresh double satisfies the signature without affecting the outcome.
      expectStateMatches(
        State.step(before, args.dt, args.input, { random: RandomService.createFake() }),
        after,
      );
    });
  }

  it("returns the same reference (not just an equal value) when the game is over", () => {
    const state = { ...State.create(), lives: 0 };
    expect(State.step(state, 0.016, Input.none, { random: RandomService.createFake() })).toBe(state);
  });

  // The randomized refill branch, kept out of the shared tick-loop cases: a
  // cleared field refills through `spawnRandomWave`, deterministic GIVEN the
  // injected double. Positions are the fixed ring; only drift speeds vary,
  // computed from the published `RandomService.fakeRandoms` schedule.
  it("refills a cleared field with a randomized wave (deterministic given the injected double)", () => {
    const before: State = {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [],
      score: 0,
      lives: 3,
      wave: 0,
    };
    const after = State.step(before, 0.1, Input.none, { random: RandomService.createFake() });
    expectStateMatches(after, {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      bullets: [],
      asteroids: [
        { position: [180, 100], velocity: [0, 30], size: "large" },
        { position: [100, 180], velocity: [-60, 0], size: "large" },
        { position: [20, 100], velocity: [0, -45], size: "large" },
        { position: [100, 20], velocity: [75, 0], size: "large" },
      ],
      score: 0,
      lives: 3,
      wave: 1,
    });
  });
});
