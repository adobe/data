// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { spawnRandomWave } from "./spawn-random-wave.js";
import { create } from "./create.js";

// Inert, spec-owned cases for the value-returning, service-injected
// `spawnRandomWave`. The injected `random` port is DATA-only here: its draws are
// scheduled in `responses` (the case owns the sequence), and the runner synthesizes
// the recording double from the manifest's `services` template. `next` is a
// value-returning read, not a fire-and-forget effect, so it is NOT declared in
// `effects`. Shared with the ecs `spawnRandomWave` action (the transaction is
// system-dispatched and skipped by name).
//
// A spawn draws exactly 4 values (one per asteroid at `asteroidsFor(1) = 4`). Field
// 200×200 → centre [100,100], ring radius 80; positions match `spawnWave`, only
// drift SPEED is jittered: `speed(i) = 60·(0.5 + sequence[i])` → [30, 60, 45, 75] in
// ring order.
const field = { ...create(), bounds: [200, 200] as [number, number] };

export const cases: Conformance.SpecCases<State, typeof spawnRandomWave> = {
  cases: [
    {
      name: "spawns a randomized wave (jittered drift speeds) when the field is clear",
      before: { ...field, entities: new Map(), wave: 0 },
      responses: { random: { next: [0, 0.5, 0.25, 0.75] } },
      after: {
        ...field,
        wave: 1,
        entities: new Map([
          [1, { position: [180, 100], velocity: [0, 30], size: "large" }],
          [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
          [3, { position: [20, 100], velocity: [0, -45], size: "large" }],
          [4, { position: [100, 20], velocity: [75, 0], size: "large" }],
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
