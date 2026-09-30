// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { spawnWave } from "./spawn-wave.js";
import { create } from "./create.js";

// Cases for the deterministic `spawnWave` helper `createInitial` composes (no args). When the field is clear it bumps the wave and
// spawns a ring of large asteroids drifting tangentially at 60px/s; while asteroids
// remain it is a no-op. Field 200×200 → centre [100,100], ring radius 80; wave 1 has
// 4 rocks, on the four quadrant angles.
const field = { ...create(), bounds: [200, 200] as [number, number] };

export const cases: Conformance.SpecCases<State, typeof spawnWave> = {
  cases: [
    {
      name: "spawns the next wave of large asteroids when the field is clear",
      before: { ...field, entities: new Map(), wave: 0 },
      after: {
        ...field,
        wave: 1,
        entities: new Map([
          [1, { position: [180, 100], velocity: [0, 60], size: "large" }],
          [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
          [3, { position: [20, 100], velocity: [0, -60], size: "large" }],
          [4, { position: [100, 20], velocity: [60, 0], size: "large" }],
        ]),
      },
    },
    {
      name: "does nothing while asteroids still remain",
      before: {
        ...field,
        wave: 1,
        entities: new Map([
          [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
        ]),
      },
      after: {
        ...field,
        wave: 1,
        entities: new Map([
          [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
        ]),
      },
    },
  ],
};
