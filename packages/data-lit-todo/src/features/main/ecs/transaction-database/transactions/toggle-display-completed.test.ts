// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `toggleDisplayCompleted` conforms to `State.toggleDisplayCompleted`: it flips
// the `displayCompleted` resource, leaving the todos untouched.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/toggle-display-completed.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { toggleDisplayCompleted } from "./toggle-display-completed.js";

describe("toggleDisplayCompleted transaction conforms to State.toggleDisplayCompleted", () => {
  expectConforms({
    cases,
    spec: State.toggleDisplayCompleted,
    apply: toggleDisplayCompleted,
  });
});
