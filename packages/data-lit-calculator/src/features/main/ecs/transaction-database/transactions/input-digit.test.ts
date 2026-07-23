// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `inputDigit` conforms to `State.inputDigit`: on a fresh entry the digit
// replaces the display, otherwise it appends (collapsing a lone leading zero),
// and it is a no-op while an error is showing.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/input-digit.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { inputDigit } from "./input-digit.js";

describe("inputDigit transaction conforms to State.inputDigit", () => {
  expectConforms({
    cases,
    spec: (before, digit) => State.inputDigit(before, digit),
    apply: (store, digit) => inputDigit(store, digit),
  });
});
