// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setAnswerCode } from "./set-answer-code.js";

// Inert, spec-owned cases for `setAnswerCode`, shared with the ecs `setAnswerCode`
// transaction and action.
export const cases: Conformance.SpecCases<State, typeof setAnswerCode> = {
  cases: [
    {
      name: "stores the answer code and clears the banner",
      before: { bannerText: "Generating answer — please wait…" },
      args: { code: "ANSWER-456" },
      after: { answerCode: "ANSWER-456", bannerText: "" },
    },
  ],
};
