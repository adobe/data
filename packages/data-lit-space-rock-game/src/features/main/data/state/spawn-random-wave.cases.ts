// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { RandomService } from "../../services/random-service/random-service.js";

// Spec-owned `{ before, args, after }` cases for `State.spawnRandomWave`, shared
// with the ecs `spawnRandomWave` transaction. The args carry the SAME injected
// double on both sides — `RandomService.createFake()` replays
// `RandomService.fakeRandoms` — so the randomized velocities are exact and the
// two sides agree: conformance stays honest even though the transition draws
// randomness.
//
// The published sequence has length 4 and a spawn draws exactly 4 values (one
// per asteroid at `asteroidsFor(1) = 4`), so the conformance runner re-consuming
// the same double for `spec` and then `apply` cycles cleanly back to the same
// four values (index % length) — the assertion is identical on both passes.
//
// Field 200×200 → centre [100,100], ring radius 80; positions match `spawnWave`,
// only drift SPEED is jittered: `speed(i) = 60·(0.5 + fakeRandoms[i])` →
// [30, 60, 45, 75] in ring order.
const field = { ...State.create(), bounds: [200, 200] as [number, number] };

export const cases: readonly ConformanceCase<{ random: RandomService }>[] = [
  {
    name: "spawns a randomized wave (jittered drift speeds) when the field is clear",
    before: { ...field, asteroids: [], wave: 0 },
    args: { random: RandomService.createFake() },
    after: {
      ...field,
      wave: 1,
      asteroids: [
        { position: [180, 100], velocity: [0, 30], size: "large" },
        { position: [100, 180], velocity: [-60, 0], size: "large" },
        { position: [20, 100], velocity: [0, -45], size: "large" },
        { position: [100, 20], velocity: [75, 0], size: "large" },
      ],
    },
  },
  {
    name: "does nothing while asteroids still remain",
    before: {
      ...field,
      wave: 1,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
    },
    args: { random: RandomService.createFake() },
    after: {
      ...field,
      wave: 1,
      asteroids: [{ position: [10, 10], velocity: [0, 0], size: "large" }],
    },
  },
];
