// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import { PlayMoveArgs } from "../play-move-args/play-move-args.js";
import type { State } from "./state.js";

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
