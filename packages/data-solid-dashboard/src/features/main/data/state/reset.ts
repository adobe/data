// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Return the counter to zero and record the reset in the activity log.
export const reset = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => ({
  count: 0,
  log: [...state.log, "Reset to 0"],
});

// Spec-owned cases, shared with the ecs `reset` transaction and action.
export const cases: Conformance<typeof reset> = [
  { name: "resets a positive count and logs the reset",
    before: { count: 7, log: ["earlier"] },
    after: { count: 0, log: ["earlier", "Reset to 0"] } },
  { name: "logs the reset even when already at zero",
    before: {},
    after: { count: 0, log: ["Reset to 0"] } },
];
