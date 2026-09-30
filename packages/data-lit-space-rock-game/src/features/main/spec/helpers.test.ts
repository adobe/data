// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as helpers from "./helpers.js";
import { components } from "../data/components/index.js";
import { resources } from "../data/resources/index.js";

import { cases as spawnWave } from "./spawn-wave.cases.js";
import { cases as stepShip } from "./step-ship.cases.js";
import { cases as stepBullets } from "./step-bullets.cases.js";
import { cases as stepAsteroids } from "./step-asteroids.cases.js";
import { cases as resolveBulletHits } from "./resolve-bullet-hits.cases.js";
import { cases as resolveShipHits } from "./resolve-ship-hits.cases.js";

// Runs each sub-step helper's cases against the pure function. Spec-only: these are
// covered on the ECS side through the transitions that compose them.
Conformance.checkSpec(
  Conformance.spec({
    state: State,
    fns: helpers,
    schemas: { ...components, ...resources },
    cases: { spawnWave, stepShip, stepBullets, stepAsteroids, resolveBulletHits, resolveShipHits },
  }),
);
