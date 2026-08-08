// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

// Change the active user's name and record the change in the activity log.
export const setUserName = (
  state: Pick<State, "userName" | "log">,
  { name }: { name: string },
): Pick<State, "userName" | "log"> => ({
  userName: name,
  log: [...state.log, `Name changed to ${name}`],
});

// Spec-owned cases, shared with the ecs `setUserName` transaction and action.
export const cases: Conformance<typeof setUserName> = [
  { name: "sets the name and logs the change",
    before: {},
    args: { name: "Ada" },
    after: { userName: "Ada", log: ["Name changed to Ada"] } },
  { name: "replaces an existing name, preserving prior log entries",
    before: { log: ["earlier"], userName: "Ada" },
    args: { name: "Grace" },
    after: { userName: "Grace", log: ["earlier", "Name changed to Grace"] } },
];
