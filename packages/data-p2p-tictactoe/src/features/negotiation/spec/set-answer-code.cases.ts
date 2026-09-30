// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setAnswerCode } from "./set-answer-code.js";

// Inert cases for `setAnswerCode`, run against the pure spec and the `setAnswerCode`
// action.
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
