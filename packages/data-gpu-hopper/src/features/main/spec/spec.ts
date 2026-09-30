// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import * as systems from "./systems.js";

import { cases as hop } from "./hop.cases.js";
import { cases as newGame } from "./new-game.cases.js";
import { cases as movement } from "./movement.cases.js";
import { cases as collision } from "./collision.cases.js";
import { cases as frame } from "./frame.cases.js";

// The feature's spec: the `hop` / `newGame` actions and the `movement` / `collision`
// systems, each with its inert cases, plus whole-frame cases. No entity references and
// no injected services, so no `schemas` or `services`.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: { hop, newGame },
  systems: { fns: systems, cases: { movement, collision }, frame },
});
