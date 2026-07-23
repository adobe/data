// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setOperation` conforms to `State.setOperation`: it commits the entry as the
// left operand and latches the operation, only swaps the pending op when pressed
// right after another, folds a running calculation first, propagates a
// divide-by-zero raised while folding, and is a no-op while an error is showing.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/set-operation.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setOperation } from "./set-operation.js";

describe("setOperation transaction conforms to State.setOperation", () => {
  expectConforms({
    cases,
    spec: State.setOperation,
    apply: setOperation,
  });
});
