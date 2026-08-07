// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Empty the activity log. The counter and user name are left untouched — the
// runner keeps them, since this writes only `log`.
export const clearLog = (
  _state: Pick<State, "log">,
): Pick<State, "log"> => ({ log: [] });

// Spec-owned cases, shared with the ecs `clearLog` transaction and action.
export const cases: Conformance<typeof clearLog> = [
  { name: "empties a populated log, leaving count and name intact",
    before: { count: 2, log: ["a", "b"], userName: "Ada" },
    after: { log: [] } },
  { name: "is a no-op on an already empty log",
    before: {},
    after: {} },
];
