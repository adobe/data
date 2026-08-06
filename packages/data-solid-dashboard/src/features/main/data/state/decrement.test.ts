// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: ConformanceCase<void>[] = [
  {
    name: "decrements a positive count and logs the new value",
    before: { ...State.create(), count: 3, log: ["earlier"] },
    args: undefined,
    after: { ...State.create(), count: 2, log: ["earlier", "Decremented to 2"] },
  },
  {
    name: "is a no-op at zero, leaving state untouched",
    before: { ...State.create() },
    args: undefined,
    after: { ...State.create() },
  },
];

describe("State.decrement", () => {
  for (const testCase of cases) {
    it(testCase.name, () => {
      expectStateMatches(State.decrement(testCase.before), testCase.after);
    });
  }
});
