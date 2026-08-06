// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import { RandomService } from "../../services/random-service/random-service.js";
import { cases } from "./spawn-random-wave.cases.js";
import { expectStateMatches } from "./expect-state-matches.js";

// The transition takes an injected service, so its assertions lean on the
// double's PUBLISHED response schedule (`RandomService.fakeRandoms`, replayed in
// order), never on any hidden behaviour — mirroring todo's `createRandomTodo`.
describe("State.spawnRandomWave", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.spawnRandomWave(before, args), after);
    });
  }

  it("draws one value per asteroid from the published schedule, in ring order", () => {
    // Explicit schedule → exact per-asteroid speeds. speed(i) = 60·(0.5 + seq[i]),
    // so seq 1 → 90 and seq 0 → 30; positions are the same deterministic ring.
    const random = RandomService.createFake([1, 0, 1, 0]);
    const after = State.spawnRandomWave(
      { ...State.create(), bounds: [200, 200], asteroids: [], wave: 0 },
      { random },
    );
    expectStateMatches(after, {
      ...State.create(),
      bounds: [200, 200],
      wave: 1,
      asteroids: [
        { position: [180, 100], velocity: [0, 90], size: "large" },
        { position: [100, 180], velocity: [-30, 0], size: "large" },
        { position: [20, 100], velocity: [0, -90], size: "large" },
        { position: [100, 20], velocity: [30, 0], size: "large" },
      ],
    });
  });
});
