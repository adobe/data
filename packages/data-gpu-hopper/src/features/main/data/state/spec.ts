// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";

import { cases as hop } from "./hop.cases.js";
import { cases as step } from "./step.cases.js";
import { cases as winGoal } from "./win-goal.cases.js";
import { cases as loseLife } from "./lose-life.cases.js";
import { cases as newGame } from "./new-game.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. It wires each conformed fn to its inert cases module explicitly: `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms` (a fn without cases, or cases without
// a fn, won't type). Hopper has no derivations (so no `computedPlugin`, no `hydrate`)
// and no capability services (so no `services`). `step` has no ecs transaction — the
// per-frame system loop conforms it — so `checkFeature` skips it while `checkSpec`
// verifies it against the pure function.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
  cases: {
    hop,
    step,
    winGoal,
    loseLife,
    newGame,
  },
});
