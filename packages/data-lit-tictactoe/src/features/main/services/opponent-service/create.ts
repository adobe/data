// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardCell } from "../../data/board-cell/board-cell.js";
import type { OpponentService } from "./opponent-service.js";

/**
 * Production opponent. Chooses uniformly at random among the board's empty
 * cells after a short "thinking" delay, simulating a model-backed selector so
 * the async boundary — and its latency — is real. Returns -1 when the board is
 * full (the caller guards illegal moves).
 */
export const create = (): OpponentService => ({
  serviceName: "opponent",
  selectMove: (board) =>
    new Promise<number>((resolve) => {
      const empty: number[] = [];
      for (let i = 0; i < board.length; i++) {
        if (board[i] === BoardCell.blank) empty.push(i);
      }
      const choice =
        empty.length === 0 ? -1 : empty[Math.floor(Math.random() * empty.length)];
      const delayMs = 100 + Math.floor(Math.random() * 300);
      setTimeout(() => resolve(choice), delayMs);
    }),
});
