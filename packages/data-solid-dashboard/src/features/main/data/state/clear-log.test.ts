// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: ConformanceCase<void>[] = [
  {
    name: "empties a populated log, leaving count and name intact",
    before: { ...State.create(), count: 2, log: ["a", "b"], userName: "Ada" },
    args: undefined,
    after: { ...State.create(), count: 2, log: [], userName: "Ada" },
  },
  {
    name: "is a no-op on an already empty log",
    before: { ...State.create() },
    args: undefined,
    after: { ...State.create() },
  },
];

describe("State.clearLog", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expectStateMatches(State.clearLog(testCase.before), testCase.after);
    });
  }
});
