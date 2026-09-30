// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../data/values/board-state/board-state.js";
import { PlayerMark } from "../data/values/player-mark/player-mark.js";
import type { State } from "./state.js";
import { board } from "./board.js";

// Tally the finished game into the scoreboard, hand the first move to the other
// player, and clear the board.
export const restartGame = (state: State): State => {
  const winner = BoardState.getWinner(board(state));
  return {
    marks: new Map(),
    firstPlayer: PlayerMark.opponent[state.firstPlayer],
    xWins: state.xWins + (winner === "X" ? 1 : 0),
    oWins: state.oWins + (winner === "O" ? 1 : 0),
    draws: state.draws + (winner === "cat" ? 1 : 0),
  };
};
