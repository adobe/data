// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Conformance } from "@adobe/data-testing";
import { State } from "./state.js";
import * as transforms from "./transforms.js";

import { cases as increment } from "./increment.cases.js";
import { cases as decrement } from "./decrement.cases.js";
import { cases as reset } from "./reset.cases.js";
import { cases as setUserName } from "./set-user-name.cases.js";
import { cases as clearLog } from "./clear-log.cases.js";

// The feature's spec: every action, one inert cases module each (coverage checked at
// compile time against `transforms`). State holds no entity references and no action
// injects services, so it needs no `schemas` or `services`.
export const spec = Conformance.spec({
  state: State,
  fns: transforms,
  cases: {
    increment,
    decrement,
    reset,
    setUserName,
    clearLog,
  },
});
