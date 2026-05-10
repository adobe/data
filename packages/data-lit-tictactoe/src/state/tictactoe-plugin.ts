// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../types/board-state/board-state";
import { PlayerMark } from "../types/player-mark/player-mark";
import { PlayMoveArgs } from "../types/play-move-args/play-move-args";

export const tictactoePlugin = Database.Plugin.create({
  resources: {
    board: { default: BoardState.createInitialBoard() },
    firstPlayer: { default: PlayerMark.values[0] },
  },
  computed: {
    currentPlayer: (db) =>
      Observe.withFilter(db.observe.resources.board, (board) =>
        BoardState.currentPlayer(board, db.resources.firstPlayer),
      ),
    moveCount: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.getMoveCount),
    status: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.deriveStatus),
    winningLine: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.getWinningLine),
    winner: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.getWinner),
    isGameOver: (db) =>
      Observe.withFilter(db.observe.resources.board, BoardState.isGameOver),
  },
  transactions: {
    restartGame: (t) => {
      t.resources.firstPlayer = PlayerMark.opponent[t.resources.firstPlayer];
      t.resources.board = BoardState.createInitialBoard();
    },
    playMove: (t, { index }: PlayMoveArgs) => {
      const mark = BoardState.currentPlayer(
        t.resources.board,
        t.resources.firstPlayer,
      );
      // When userId is set (sync/P2P mode) a peer may only play their own mark.
      if (t.userId !== undefined && t.userId !== mark) return;
      const validation = PlayMoveArgs.canPlayMove({
        board: t.resources.board,
        index,
      });
      if (!validation.ok) return;
      t.resources.board = BoardState.setBoardCell({
        board: t.resources.board,
        index,
        mark,
      });
    },
  },
});

export type TictactoeDatabase = Database.FromPlugin<typeof tictactoePlugin>;
