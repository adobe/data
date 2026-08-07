// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Lower the counter by one, never below zero. At the floor it writes the slice
// back unchanged (no log entry), keeping the transform idempotent at zero.
export const decrement = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => {
  if (state.count <= 0) return { count: state.count, log: state.log };
  const count = state.count - 1;
  return { count, log: [...state.log, `Decremented to ${count}`] };
};

// Spec-owned cases, shared with the ecs `decrement` transaction and action.
export const cases: Conformance<typeof decrement> = [
  { name: "decrements a positive count and logs the new value",
    before: { count: 3, log: ["earlier"] },
    after: { count: 2, log: ["earlier", "Decremented to 2"] } },
  { name: "is a no-op at zero, leaving state untouched",
    before: {},
    after: {} },
];
