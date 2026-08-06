// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: ConformanceCase<void>[] = [
  {
    name: "increments from zero and logs the new value",
    before: { ...State.create() },
    args: undefined,
    after: { ...State.create(), count: 1, log: ["Incremented to 1"] },
  },
  {
    name: "increments an existing count, preserving prior log entries",
    before: { ...State.create(), count: 4, log: ["earlier"] },
    args: undefined,
    after: { ...State.create(), count: 5, log: ["earlier", "Incremented to 5"] },
  },
];

describe("State.increment", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expectStateMatches(State.increment(testCase.before), testCase.after);
    });
  }
});
