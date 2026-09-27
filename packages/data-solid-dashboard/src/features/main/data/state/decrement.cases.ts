// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { decrement } from "./decrement.js";

// Inert, spec-owned cases for `decrement` — data only, shared with the ecs
// `decrement` transaction and action.
export const cases: Conformance.SpecCases<State, typeof decrement> = {
  cases: [
    {
      name: "decrements a positive count and logs the new value",
      before: { count: 3, log: ["earlier"] },
      after: { count: 2, log: ["earlier", "Decremented to 2"] },
    },
    {
      name: "is a no-op at zero, leaving state untouched",
      before: {},
      after: {},
    },
  ],
};
