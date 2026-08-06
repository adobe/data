// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: ConformanceCase<void>[] = [
  {
    name: "resets a positive count and logs the reset",
    before: { ...State.create(), count: 7, log: ["earlier"] },
    args: undefined,
    after: { ...State.create(), count: 0, log: ["earlier", "Reset to 0"] },
  },
  {
    name: "logs the reset even when already at zero",
    before: { ...State.create() },
    args: undefined,
    after: { ...State.create(), count: 0, log: ["Reset to 0"] },
  },
];

describe("State.reset", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expectStateMatches(State.reset(testCase.before), testCase.after);
    });
  }
});
