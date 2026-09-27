// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setHostAnswerInput } from "./set-host-answer-input.js";

// Inert, spec-owned cases for `setHostAnswerInput`, shared with the ecs
// `setHostAnswerInput` transaction and action.
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
