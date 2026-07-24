// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `spawnWave` conforms to `State.spawnWave`: it reads the field/wave/bounds from
// the seeded store, defers the count and ring layout to the transform, and
// inserts the result — a no-op while asteroids remain.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/spawn-wave.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { spawnWave } from "./spawn-wave.js";

describe("spawnWave transaction conforms to State.spawnWave", () => {
  expectConforms({
    cases,
    spec: State.spawnWave,
    apply: spawnWave,
  });
});
