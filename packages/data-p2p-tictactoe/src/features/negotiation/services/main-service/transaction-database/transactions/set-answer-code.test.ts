// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-answer-code.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setAnswerCode } from "./set-answer-code.js";

describe("setAnswerCode transaction conforms to State.setAnswerCode", () => {
  expectConforms({
    cases,
    spec: State.setAnswerCode,
    apply: setAnswerCode,
  });
});
