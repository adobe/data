// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{ code: string }>[] = [
  {
    name: "stores the answer code and clears the banner",
    before: { ...State.create(), bannerText: "Generating answer — please wait…" },
    args: { code: "ANSWER-456" },
    after: { ...State.create(), answerCode: "ANSWER-456" },
  },
];

describe("State.setAnswerCode", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setAnswerCode(before, args), after);
    });
  }
});
