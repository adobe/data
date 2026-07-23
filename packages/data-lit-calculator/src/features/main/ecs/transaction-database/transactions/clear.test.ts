// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `clear` conforms to `State.clear`: it replaces the calculator with the initial
// state regardless of what came before.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/clear.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { clear } from "./clear.js";

describe("clear transaction conforms to State.clear", () => {
  expectConforms({
    cases,
    spec: () => State.clear(),
    apply: (store) => clear(store),
  });
});
