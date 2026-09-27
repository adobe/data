// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { reset } from "./reset.js";

// Inert, spec-owned cases for `reset` — data only, shared with the ecs `reset`
// transaction and action.
export const cases: Conformance.SpecCases<State, typeof reset> = {
  cases: [
    {
      name: "resets a positive count and logs the reset",
      before: { count: 7, log: ["earlier"] },
      after: { count: 0, log: ["earlier", "Reset to 0"] },
    },
    {
      name: "logs the reset even when already at zero",
      before: {},
      after: { count: 0, log: ["Reset to 0"] },
    },
  ],
};
