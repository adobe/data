// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Raise the counter by one and record it in the activity log.
export const increment = <T extends Pick<State, "count" | "log">>(state: T): T => {
  const count = state.count + 1;
  return { ...state, count, log: [...state.log, `Incremented to ${count}`] };
};

// Spec-owned cases, shared with the ecs `increment` transaction and action.
// `before`/`after` are authored as full `State` literals (a value-level import of
// the `State` namespace here would form an eager `state → public → increment`
// cycle, so the defaults are inlined).
export const cases: Conformance<typeof increment> = [
  {
    name: "increments from zero and logs the new value",
    before: { count: 0, log: [], userName: "Guest" },
    args: undefined,
    after: { count: 1, log: ["Incremented to 1"], userName: "Guest" },
  },
  {
    name: "increments an existing count, preserving prior log entries",
    before: { count: 4, log: ["earlier"], userName: "Guest" },
    args: undefined,
    after: { count: 5, log: ["earlier", "Incremented to 5"], userName: "Guest" },
  },
];
