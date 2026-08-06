// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: ConformanceCase<{ name: string }>[] = [
  {
    name: "sets the name and logs the change",
    before: { ...State.create() },
    args: { name: "Ada" },
    after: { ...State.create(), userName: "Ada", log: ["Name changed to Ada"] },
  },
  {
    name: "replaces an existing name, preserving prior log entries",
    before: { ...State.create(), userName: "Ada", log: ["earlier"] },
    args: { name: "Grace" },
    after: { ...State.create(), userName: "Grace", log: ["earlier", "Name changed to Grace"] },
  },
];

describe("State.setUserName", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expectStateMatches(State.setUserName(testCase.before, testCase.args), testCase.after);
    });
  }
});
