// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setUserName } from "./set-user-name.js";

// Inert, spec-owned cases for `setUserName` — data-only `args` ({ name }), shared
// with the ecs `setUserName` transaction and action.
export const cases: Conformance.SpecCases<State, typeof setUserName> = {
  cases: [
    {
      name: "sets the name and logs the change",
      before: {},
      args: { name: "Ada" },
      after: { userName: "Ada", log: ["Name changed to Ada"] },
    },
    {
      name: "replaces an existing name, preserving prior log entries",
      before: { log: ["earlier"], userName: "Ada" },
      args: { name: "Grace" },
      after: { userName: "Grace", log: ["earlier", "Name changed to Grace"] },
    },
  ],
};
