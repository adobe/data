// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setHostAnswerInput } from "./set-host-answer-input.js";

// Inert cases for `setHostAnswerInput`, run against the pure spec and the
// `setHostAnswerInput` action.
export const cases: Conformance.SpecCases<State, typeof setHostAnswerInput> = {
  cases: [
    {
      name: "stores the host answer input",
      before: {},
      args: { value: "ANSWER-abc" },
      after: { hostAnswerInput: "ANSWER-abc" },
    },
  ],
};
