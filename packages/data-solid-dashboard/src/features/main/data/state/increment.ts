// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Raise the counter by one and record it in the activity log. Returns only the
// fields it writes (count + log); the runner merges the patch over the rest.
export const increment = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => {
  const count = state.count + 1;
  return { count, log: [...state.log, `Incremented to ${count}`] };
};

// Spec-owned cases, shared with the ecs `increment` transaction and action.
// `before` is a delta over `State.create()`; `after` is the writes patch.
export const cases: Conformance<typeof increment> = [
  { name: "increments from zero and logs the new value",
    before: {},
    after: { count: 1, log: ["Incremented to 1"] } },
  { name: "increments an existing count, preserving prior log entries",
    before: { count: 4, log: ["earlier"] },
    after: { count: 5, log: ["earlier", "Incremented to 5"] } },
];
