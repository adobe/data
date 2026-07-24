// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `winGoal` conforms to `State.winGoal` — score + win, and no-op once finished.
// Shared spec cases.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/win-goal.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { winGoal } from "./win-goal.js";

describe("winGoal transaction conforms to State.winGoal", () => {
  expectConforms({
    cases,
    spec: State.winGoal,
    apply: winGoal,
  });
});
