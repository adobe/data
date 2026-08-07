// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Change the active user's name and record the change in the activity log.
export const setUserName = <T extends Pick<State, "userName" | "log">>(
  state: T,
  { name }: { name: string },
): T => ({
  ...state,
  userName: name,
  log: [...state.log, `Name changed to ${name}`],
});

// Spec-owned cases, shared with the ecs `setUserName` transaction and action.
export const cases: Conformance<typeof setUserName> = [
  {
    name: "sets the name and logs the change",
    before: { count: 0, log: [], userName: "Guest" },
    args: { name: "Ada" },
    after: { count: 0, log: ["Name changed to Ada"], userName: "Ada" },
  },
  {
    name: "replaces an existing name, preserving prior log entries",
    before: { count: 0, log: ["earlier"], userName: "Ada" },
    args: { name: "Grace" },
    after: { count: 0, log: ["earlier", "Name changed to Grace"], userName: "Grace" },
  },
];
