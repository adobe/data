// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{ value: string }>[] = [
  {
    name: "stores the host answer input",
    before: State.create(),
    args: { value: "ANSWER-abc" },
    after: { ...State.create(), hostAnswerInput: "ANSWER-abc" },
  },
];

describe("State.setHostAnswerInput", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setHostAnswerInput(before, args), after);
    });
  }
});
