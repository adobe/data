// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import { PlayerMark } from "../player-mark/player-mark.js";
import type { State } from "./state.js";

// Tally the finished game into the scoreboard, hand the first move to the other
// player, and clear the board.
export const restartGame = (state: State): State => {
  const winner = BoardState.getWinner(state.board);
  const status = BoardState.deriveStatus(state.board);
  return {
    board: BoardState.createInitialBoard(),
    firstPlayer: PlayerMark.opponent[state.firstPlayer],
    xWins: state.xWins + (winner === "X" ? 1 : 0),
    oWins: state.oWins + (winner === "O" ? 1 : 0),
    draws: state.draws + (status === "draw" ? 1 : 0),
  };
};
