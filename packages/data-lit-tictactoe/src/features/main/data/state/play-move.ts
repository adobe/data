// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import { PlayMoveArgs } from "../play-move-args/play-move-args.js";
import type { State } from "./state.js";

// Place the current player's mark into `index`. Illegal moves (out of bounds,
// occupied, game over) are ignored, keeping the transform idempotent.
export const playMove = <T extends Pick<State, "board" | "firstPlayer">>(
  state: T,
  input: PlayMoveArgs,
): T => {
  if (!PlayMoveArgs.canPlayMove({ board: state.board, index: input.index }).ok) {
    return state;
  }
  const mark = BoardState.currentPlayer(state.board, state.firstPlayer);
  return {
    ...state,
    board: BoardState.setBoardCell({ board: state.board, index: input.index, mark }),
  };
};
