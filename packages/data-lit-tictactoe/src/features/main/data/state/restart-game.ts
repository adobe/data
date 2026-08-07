// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import { PlayerMark } from "../player-mark/player-mark.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

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

// Spec-owned cases (no args), shared with the ecs `restartGame` transaction.
// Every restart clears the board and hands the first move to the other player;
// the scoreboard is bumped only for the finished game's outcome — X win, O win,
// draw (cat), or, when the game wasn't finished, no counter at all.
export const cases: Conformance<typeof restartGame> = [
  {
    name: "tallies an X win, alternates first player, clears the board",
    before: { board: "XXX      ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
  },
  {
    name: "tallies an O win",
    before: { board: "OOOXX    ", firstPlayer: "O", xWins: 1, oWins: 2, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "X", xWins: 1, oWins: 3, draws: 0 },
  },
  {
    name: "tallies a draw (full board, no line)",
    before: { board: "XOXXOOOXX", firstPlayer: "O", xWins: 2, oWins: 1, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "X", xWins: 2, oWins: 1, draws: 1 },
  },
  {
    name: "restarts an unfinished game without touching any counter",
    before: { board: "X O      ", firstPlayer: "X", xWins: 1, oWins: 1, draws: 1 },
    args: undefined,
    after: { board: "         ", firstPlayer: "O", xWins: 1, oWins: 1, draws: 1 },
  },
];
