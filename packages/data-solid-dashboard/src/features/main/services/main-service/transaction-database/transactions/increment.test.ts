// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `increment` conforms to `State.increment`: it raises `count` and appends the
// matching log entry.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/increment.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { increment } from "./increment.js";

describe("increment transaction conforms to State.increment", () => {
  expectConforms({
    cases,
    spec: State.increment,
    apply: (store) => increment(store),
  });
});
