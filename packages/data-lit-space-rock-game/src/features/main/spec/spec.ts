// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import * as systems from "./systems.js";
import { components } from "../data/components/index.js";
import { resources } from "../data/resources/index.js";
import { RandomService } from "../services/random-service/random-service.js";
import { Ship } from "../data/values/ship/ship.js";
import type { Bullet } from "../data/values/bullet/bullet.js";
import type { Asteroid } from "../data/values/asteroid/asteroid.js";

import { cases as createInitial } from "./create-initial.cases.js";
import { cases as fireBullet } from "./fire-bullet.cases.js";
import { cases as spawnRandomWave } from "./spawn-random-wave.cases.js";
import { cases as control } from "./control.cases.js";
import { cases as movement } from "./movement.cases.js";
import { cases as lifetime } from "./lifetime.cases.js";
import { cases as collision } from "./collision.cases.js";
import { cases as waves } from "./waves.cases.js";

// The feature's spec: every transition and every ECS system, one inert cases module
// each (coverage checked at compile time). `noOp` is a state every system must leave
// unchanged; the runner checks it against each one. `schemas` supplies the column
// precision the comparator reads; `services` is the shape template the runner builds
// `random` recording doubles from. `ecs/conformance/` pairs this with the ECS build
// and owns the whole-frame cases.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  schemas: { ...components, ...resources },
  services: { random: RandomService.createFake },
  cases: {
    createInitial,
    fireBullet,
    spawnRandomWave,
  },
  systems: {
    fns: systems,
    cases: { control, movement, lifetime, collision, waves },
    noOp: [
      {
        // Everything is live: input held, ship and asteroid moving, a bullet on a
        // small asteroid, a large one on the ship.
        name: "frozen once the game is over",
        before: {
          bounds: [200, 200],
          ship: Ship.spawn([100, 100]),
          entities: new Map<number, Bullet | Asteroid>([
            [1, { position: [50, 50], velocity: [0, 0], age: 0.5 }],
            [2, { position: [50, 50], velocity: [10, 0], size: "small" }],
            [3, { position: [100, 100], velocity: [0, 10], size: "large" }],
          ]),
          score: 40,
          lives: 0,
          wave: 2,
        },
        args: { dt: 0.1, input: { turn: 1, thrust: true, fire: true } },
      },
      {
        // A cleared field, which would make `waves` refill.
        name: "frozen once the game is over, even on a cleared field",
        before: { bounds: [200, 200], ship: Ship.spawn([100, 100]), entities: new Map(), score: 40, lives: 0, wave: 3 },
        args: { dt: 0.1, input: { turn: 1, thrust: true, fire: true } },
      },
    ],
  },
});
