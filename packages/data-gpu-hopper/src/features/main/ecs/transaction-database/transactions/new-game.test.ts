// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `newGame` conforms to `State.create` — it discards whatever the store held and
// re-seeds the initial game. The shared case seeds a fully-divergent mid-run
// state so the reset is proven total.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/new-game.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { newGame } from "./new-game.js";

describe("newGame transaction conforms to State.create", () => {
  expectConforms({
    cases,
    spec: State.create,
    apply: newGame,
  });
});
