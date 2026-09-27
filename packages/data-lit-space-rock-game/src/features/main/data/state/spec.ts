// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";
import { createFake as random } from "../../services/random-service/random.fake.js";

import { cases as createInitial } from "./create-initial.cases.js";
import { cases as fireBullet } from "./fire-bullet.cases.js";
import { cases as spawnWave } from "./spawn-wave.cases.js";
import { cases as spawnRandomWave } from "./spawn-random-wave.cases.js";
import { cases as stepShip } from "./step-ship.cases.js";
import { cases as stepBullets } from "./step-bullets.cases.js";
import { cases as stepAsteroids } from "./step-asteroids.cases.js";
import { cases as resolveBulletHits } from "./resolve-bullet-hits.cases.js";
import { cases as resolveShipHits } from "./resolve-ship-hits.cases.js";
import { cases as step } from "./step.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. It wires each conformed fn to its inert cases module explicitly: `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms` (a fn without cases, or cases without
// a fn, won't type). `spawnRandomWave` and `step` inject the `random` port, so
// `services` supplies its shape-only recording template; each case owns the draws via
// its `responses`. Space-rock has no `state/` derivations (so no `computedPlugin`, no
// `hydrate`) and no entity-reference args (so no case declares an `args` schema).
//
// `checkFeature` pairs each ecs op to its same-named transition: `createInitial`
// (transaction), `fireBullet` (transaction + action), and `spawnRandomWave` (action —
// its transaction is renamed `refillWave`, the system-dispatched form, so it is not
// paired and never receives the stripped transaction args). Every per-frame transition
// has no same-named op and is skipped there; the system tick-loop test conforms them.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
  services: { random },
  cases: {
    createInitial,
    fireBullet,
    spawnWave,
    spawnRandomWave,
    stepShip,
    stepBullets,
    stepAsteroids,
    resolveBulletHits,
    resolveShipHits,
    step,
  },
});
