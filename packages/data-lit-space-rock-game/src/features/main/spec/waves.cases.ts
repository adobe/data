// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { waves } from "./waves.js";
import type { Asteroid } from "../data/values/asteroid/asteroid.js";
import type { Bullet } from "../data/values/bullet/bullet.js";

// Cases for the `waves` system. The `random` draws are scheduled in `responses`, one
// per rock of the new wave (wave 1 has 4). Field 200×200 → centre [100,100], ring
// radius 80, rocks on the quadrant angles; drift speed is `60·(0.5 + draw)` →
// [30, 60, 45, 75] in ring order.
const field: Pick<State, "bounds"> = { bounds: [200, 200] };
const ring: readonly Asteroid[] = [
  { position: [180, 100], velocity: [0, 30], size: "large" },
  { position: [100, 180], velocity: [-60, 0], size: "large" },
  { position: [20, 100], velocity: [0, -45], size: "large" },
  { position: [100, 20], velocity: [75, 0], size: "large" },
];

export const cases: Conformance.SpecCases<State, typeof waves> = {
  cases: [
    {
      name: "refills a cleared field with a randomized ring and bumps the wave",
      before: { ...field, entities: new Map(), wave: 0 },
      responses: { random: { next: [0, 0.5, 0.25, 0.75] } },
      after: { wave: 1, entities: new Map(ring.map((rock, i): [number, Asteroid] => [i + 1, rock])) },
    },
    {
      name: "bullets don't hold back the refill",
      before: { ...field, entities: new Map([[1, { position: [10, 10], velocity: [0, 0], age: 0.5 }]]), wave: 0 },
      responses: { random: { next: [0, 0.5, 0.25, 0.75] } },
      after: {
        wave: 1,
        entities: new Map<number, Bullet | Asteroid>([
          [1, { position: [10, 10], velocity: [0, 0], age: 0.5 }],
          ...ring.map((rock, i): [number, Asteroid] => [i + 2, rock]),
        ]),
      },
    },
    {
      name: "does nothing while asteroids remain",
      before: { ...field, wave: 1, entities: new Map([[1, { position: [10, 10], velocity: [0, 0], size: "large" }]]) },
      after: {},
    },
  ],
};
