// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-host-answer-input.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setHostAnswerInput } from "./set-host-answer-input.js";

describe("setHostAnswerInput transaction conforms to State.setHostAnswerInput", () => {
  expectConforms({
    cases,
    spec: State.setHostAnswerInput,
    apply: setHostAnswerInput,
  });
});
