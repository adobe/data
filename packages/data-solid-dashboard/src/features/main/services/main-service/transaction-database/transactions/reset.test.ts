// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `reset` conforms to `State.reset`: it zeroes `count` and logs the reset.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/reset.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { reset } from "./reset.js";

describe("reset transaction conforms to State.reset", () => {
  expectConforms({
    cases,
    spec: State.reset,
    apply: (store) => reset(store),
  });
});
