// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { clearLog } from "./clear-log.js";

// Inert, spec-owned cases for `clearLog` — data only, replayed against the
// `clearLog` action by conformance.
export const cases: Conformance.SpecCases<State, typeof clearLog> = {
  cases: [
    {
      name: "empties a populated log, leaving count and name intact",
      before: { count: 2, log: ["a", "b"], userName: "Ada" },
      after: { log: [] },
    },
    {
      name: "is a no-op on an already empty log",
      before: {},
      after: {},
    },
  ],
};
