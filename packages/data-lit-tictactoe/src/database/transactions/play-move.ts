// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../types/board-state/board-state.js";
import { PlayMoveArgs } from "../../types/play-move-args/play-move-args.js";
import type { CoreDatabase } from "../core-database.js";

/**
 * Play the current player's mark into `index`. In sync/P2P mode (`t.userId`
 * set) a peer may only play their own mark; illegal or out-of-turn moves are
 * silently ignored so the transaction stays idempotent under replay.
 */
export const playMove = (t: CoreDatabase.Transaction, { index }: PlayMoveArgs) => {
  const mark = BoardState.currentPlayer(
    t.resources.board,
    t.resources.firstPlayer,
  );
  if (t.userId !== undefined && t.userId !== mark) return;
  const validation = PlayMoveArgs.canPlayMove({ board: t.resources.board, index });
  if (!validation.ok) return;
  t.resources.board = BoardState.setBoardCell({
    board: t.resources.board,
    index,
    mark,
  });
};
