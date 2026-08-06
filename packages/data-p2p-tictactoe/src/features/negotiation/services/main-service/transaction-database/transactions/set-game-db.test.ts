// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/enter-game.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setGameDb } from "./set-game-db.js";

// `setGameDb` also stores a non-serializable game database handle, which the
// serializable `State` — and therefore `toState` — never observes. Passing
// `gameDb: null` isolates its visible effect, which equals `State.enterGame`.
describe("setGameDb transaction conforms to State.enterGame (phase/connection effect)", () => {
  expectConforms({
    cases,
    spec: (before) => State.enterGame(before),
    apply: (store) => setGameDb(store, { gameDb: null }),
  });
});
