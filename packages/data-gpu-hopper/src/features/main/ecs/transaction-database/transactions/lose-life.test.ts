// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `loseLife` conforms to `State.loseLife` — spend a life and respawn, end the
// game on the last life, and no-op once finished. Shared spec cases.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/lose-life.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { loseLife } from "./lose-life.js";

describe("loseLife transaction conforms to State.loseLife", () => {
  expectConforms({
    cases,
    spec: State.loseLife,
    apply: loseLife,
  });
});
