// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import type { State } from "./state.js";
import type { Derivation } from "./conformance-case.js";

// Whose turn it is: composes TWO `State` fields — the board (move count) and the
// `firstPlayer` — so it is a `state/` derivation, not single-field board math
// (see `data/state.md`). The mark-counting itself is the board's own helper
// (`BoardState.currentPlayer`), which the ecs implementation reuses directly; this
// derivation is the spec the ecs `currentPlayer` computed is conformed against.
export const currentPlayer = (state: State): PlayerMark =>
  BoardState.currentPlayer(state.board, state.firstPlayer);

// Spec-owned cases, shared with the ecs `currentPlayer` computed. A derivation
// case is `{ input, value }`; `input` is a full `State`, `value` the mark to move.
export const cases: Derivation<typeof currentPlayer> = [
  {
    name: "the first player moves on an empty board",
    input: {
      board: "         ",
      firstPlayer: "X",
      xWins: 0,
      oWins: 0,
      draws: 0,
    },
    value: "X",
  },
  {
    name: "honors a first player of O on an empty board",
    input: {
      board: "         ",
      firstPlayer: "O",
      xWins: 0,
      oWins: 0,
      draws: 0,
    },
    value: "O",
  },
  {
    name: "alternates to the opponent after the first move",
    input: {
      board: "    X    ",
      firstPlayer: "X",
      xWins: 0,
      oWins: 0,
      draws: 0,
    },
    value: "O",
  },
  {
    name: "returns to the first player after both have moved",
    input: {
      board: "XO       ",
      firstPlayer: "X",
      xWins: 1,
      oWins: 2,
      draws: 0,
    },
    value: "X",
  },
];
