// © 2026 Adobe. MIT License. See /LICENSE for details.

import { BoardState } from "../board-state/board-state";
import type { MoveRejectReason } from "../move-reject-reason";

export type CanPlayMoveArgs = {
  readonly board: BoardState;
  readonly index: number;
};

export type CanPlayMoveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: MoveRejectReason };

export const canPlayMove = ({
  board,
  index,
}: CanPlayMoveArgs): CanPlayMoveResult => {
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return { ok: false, reason: "index_out_of_bounds" };
  }

  const status = BoardState.deriveStatus(board);
  if (status === "won" || status === "draw") {
    return { ok: false, reason: "game_over" };
  }

  if (board[index] !== " ") {
    return { ok: false, reason: "cell_occupied" };
  }

  return { ok: true };
};
