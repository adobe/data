// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `newGame` conforms to `State.createInitial`: dispatched over the shared cases,
// the seeded store (deliberately dirty) is cleared and rebuilt into the fresh
// game the transform computes from the bounds alone.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/create-initial.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setBounds } from "./set-bounds.js";
import { newGame } from "./new-game.js";

describe("newGame conforms to State.createInitial", () => {
  expectConforms({
    cases,
    spec: (_before, bounds) => State.createInitial(bounds),
    apply: (store, bounds) => {
      setBounds(store, bounds);
      newGame(store);
    },
  });
});
