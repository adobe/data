// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `inputDecimal` conforms to `State.inputDecimal`: it starts "0." on a fresh
// entry, appends a point to an in-progress entry, ignores a second point
// (idempotent), and is a no-op while an error is showing.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/input-decimal.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { inputDecimal } from "./input-decimal.js";

describe("inputDecimal transaction conforms to State.inputDecimal", () => {
  expectConforms({
    cases,
    spec: State.inputDecimal,
    apply: inputDecimal,
  });
});
