// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";

import { cases as hop } from "./hop.cases.js";
import { cases as step } from "./step.cases.js";
import { cases as newGame } from "./new-game.cases.js";

// The feature's spec: every operation with its inert cases. No entity references and
// no injected services, so no `schemas` or `services`.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: { hop, step, newGame },
});
