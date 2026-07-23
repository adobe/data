// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `playMove` conforms to `State.playMove`. Both take a plain board index, so the
// `apply` closure calls the raw transaction directly on the seeded store — no
// entity resolution needed. Every branch of the move guard (legal placement,
// alternation, win, occupied / out-of-bounds / game-over no-ops) is covered by
// the shared cases.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/play-move.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { playMove } from "./play-move.js";

describe("playMove transaction conforms to State.playMove", () => {
  expectConforms({
    cases,
    spec: State.playMove,
    apply: playMove,
  });
});
