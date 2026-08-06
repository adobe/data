// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `decrement` conforms to `State.decrement`, including the no-op at zero.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/decrement.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { decrement } from "./decrement.js";

describe("decrement transaction conforms to State.decrement", () => {
  expectConforms({
    cases,
    spec: State.decrement,
    apply: (store) => decrement(store),
  });
});
