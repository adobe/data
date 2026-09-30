// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Raise the counter by one and record it in the activity log. Returns only the
// fields it writes (count + log); the runner merges the patch over the rest.
export const increment = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => {
  const count = state.count + 1;
  return { count, log: [...state.log, `Incremented to ${count}`] };
};
