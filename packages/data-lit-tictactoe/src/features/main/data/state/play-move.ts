// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import { PlayMoveArgs } from "../play-move-args/play-move-args.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";

// Place the current player's mark into `index`. Reads the board + first player,
// writes the board — a `{ board }` patch. Illegal moves (out of bounds, occupied,
// game over) leave the board unchanged, keeping the transform idempotent.
export const playMove = (
  state: Pick<State, "board" | "firstPlayer">,
  input: PlayMoveArgs,
): Pick<State, "board"> => {
  if (
    !PlayMoveArgs.canPlayMove({ board: state.board, index: input.index }).ok
  ) {
    return { board: state.board };
  }
  const mark = BoardState.currentPlayer(state.board, state.firstPlayer);
  return {
    board: BoardState.setBoardCell({
      board: state.board,
      index: input.index,
      mark,
    }),
  };
};

// Spec-owned cases, shared with the ecs `playMove` transaction. `before` is a
// delta over `State.create()` (empty board, X first, zeroed scores); `after` lists
// only what the move writes — the board. Covers a legal placement, turn alternation
// by move count, a winning placement, and the three rejections (occupied, out of
// bounds, already won) that leave the board as-is.
export const cases = /*@__PURE__*/ Conformance.cases(playMove,
  {
    name: "places the first player's mark into an empty cell",
    before: {},
    args: { index: 4 },
    after: { board: "    X    " },
  },
  {
    name: "alternates to the opponent by move count",
    before: { board: "    X    " },
    args: { index: 0 },
    after: { board: "O   X    " },
  },
  {
    name: "completes a three-in-a-row (winning placement is still just a placement)",
    before: { board: "XX  OO   ", xWins: 1, oWins: 2 },
    args: { index: 2 },
    after: { board: "XXX OO   " },
  },
  {
    name: "ignores an occupied cell (no-op)",
    before: { board: "    X    " },
    args: { index: 4 },
    after: { board: "    X    " },
  },
  {
    name: "ignores an out-of-bounds index (no-op)",
    before: { firstPlayer: "O" },
    args: { index: 9 },
    after: { board: "         " },
  },
  {
    name: "ignores a move once the game is already won (no-op)",
    before: { board: "XXX      " },
    args: { index: 4 },
    after: { board: "XXX      " },
  },
);
