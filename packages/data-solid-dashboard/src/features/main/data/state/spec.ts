// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";
import { MainService } from "../../services/main-service/main-service.js";
import { projection } from "../../services/main-service/conformance/projection.js";

import { cases as increment } from "./increment.cases.js";
import { cases as decrement } from "./decrement.cases.js";
import { cases as reset } from "./reset.cases.js";
import { cases as setUserName } from "./set-user-name.cases.js";
import { cases as clearLog } from "./clear-log.cases.js";

// The feature's conformance manifest — the single object `spec.test.ts` (pure) and
// `conformance.test.ts` (ecs) both import. `cases` names one module per conformed fn,
// checked at COMPILE TIME against `transforms`. This feature is all scalar
// singletons — no entities, no derivations, no capability services — so it needs no
// `computedPlugin`, `hydrate`, or `services`.
//
// This is a test-tier module (excluded from the runtime program) — the ONE place the
// feature touches `@adobe/data-testing`. No transform or `*.cases.ts` file does.
export const spec = Conformance.feature({
  state: State,
  fns: transforms,
  plugin: MainService.plugin,
  projection,
  cases: {
    increment,
    decrement,
    reset,
    setUserName,
    clearLog,
  },
});
