// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Lower the counter by one, never below zero. A no-op at zero returns `state`
// unchanged (no log entry), keeping the transform idempotent at the floor.
export const decrement = <T extends Pick<State, "count" | "log">>(state: T): T => {
  if (state.count <= 0) return state;
  const count = state.count - 1;
  return { ...state, count, log: [...state.log, `Decremented to ${count}`] };
};

// Spec-owned cases, shared with the ecs `decrement` transaction and action.
export const cases: Conformance<typeof decrement> = [
  {
    name: "decrements a positive count and logs the new value",
    before: { count: 3, log: ["earlier"], userName: "Guest" },
    args: undefined,
    after: { count: 2, log: ["earlier", "Decremented to 2"], userName: "Guest" },
  },
  {
    name: "is a no-op at zero, leaving state untouched",
    before: { count: 0, log: [], userName: "Guest" },
    args: undefined,
    after: { count: 0, log: [], userName: "Guest" },
  },
];
