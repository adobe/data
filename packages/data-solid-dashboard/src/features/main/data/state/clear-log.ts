// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Empty the activity log. The counter and user name are left untouched.
export const clearLog = <T extends Pick<State, "log">>(state: T): T => ({
  ...state,
  log: [],
});

// Spec-owned cases, shared with the ecs `clearLog` transaction and action.
export const cases: Conformance<typeof clearLog> = [
  {
    name: "empties a populated log, leaving count and name intact",
    before: { count: 2, log: ["a", "b"], userName: "Ada" },
    args: undefined,
    after: { count: 2, log: [], userName: "Ada" },
  },
  {
    name: "is a no-op on an already empty log",
    before: { count: 0, log: [], userName: "Guest" },
    args: undefined,
    after: { count: 0, log: [], userName: "Guest" },
  },
];
