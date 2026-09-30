// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { increment } from "./increment.js";

// Inert, spec-owned cases for `increment` — data only, replayed against the
// `increment` action by conformance. `before` is a delta over `State.create()`;
// `after` is the writes patch.
export const cases: Conformance.SpecCases<State, typeof increment> = {
  cases: [
    {
      name: "increments from zero and logs the new value",
      before: {},
      after: { count: 1, log: ["Incremented to 1"] },
    },
    {
      name: "increments an existing count, preserving prior log entries",
      before: { count: 4, log: ["earlier"] },
      after: { count: 5, log: ["earlier", "Incremented to 5"] },
    },
  ],
};
