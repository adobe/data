// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `restartGame` conforms to `State.restartGame`. It takes no args, so the
// `apply` closure just dispatches the raw transaction on the seeded store. The
// shared cases cover each scoreboard outcome — X win, O win, draw, and an
// unfinished restart that bumps no counter.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/restart-game.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { restartGame } from "./restart-game.js";

describe("restartGame transaction conforms to State.restartGame", () => {
  expectConforms({
    cases,
    spec: (before) => State.restartGame(before),
    apply: (store) => restartGame(store),
  });
});
