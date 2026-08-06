// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `spawnRandomWave` conforms to `State.spawnRandomWave`: it reads the
// field/wave/bounds from the seeded store, defers the count and jittered layout
// to the transform, and inserts the result — a no-op while asteroids remain.
// Both the spec and the ecs apply receive the SAME injected double (carried in
// each case's `args.random`), so the randomized velocities agree exactly. The
// double's four-value schedule matches the four rocks a wave spawns, so the
// runner re-consuming it for spec then apply cycles back to the same values.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/spawn-random-wave.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { spawnRandomWave } from "./spawn-random-wave.js";

describe("spawnRandomWave transaction conforms to State.spawnRandomWave", () => {
  expectConforms({
    cases,
    spec: State.spawnRandomWave,
    apply: spawnRandomWave,
  });
});
