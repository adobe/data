// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `evaluate` conforms to `State.evaluate`: it applies the pending operation and
// shows the result (which becomes the next left operand), latches the error on a
// non-finite result (divide-by-zero), and is a no-op with nothing armed or while
// an error is showing.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/evaluate.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { evaluate } from "./evaluate.js";

describe("evaluate transaction conforms to State.evaluate", () => {
  expectConforms({
    cases,
    spec: (before) => State.evaluate(before),
    apply: (store) => evaluate(store),
  });
});
