// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Tictactoe game state: board logic + Database plugin.
// The board is a 9-character string, ' ' for empty, 'X' or 'O' for played.

import { Database } from "@adobe/data/ecs";

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

export type PlayerMark = "X" | "O";
export type Cell = " " | PlayerMark;
export type Board = string; // 9 chars

const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
    [0, 4, 8], [2, 4, 6],            // diagonals
] as const;

export const Board = {
    empty(): Board { return "         "; },
    cell(board: Board, index: number): Cell { return (board[index] ?? " ") as Cell; },
    isFull(board: Board): boolean { return !board.includes(" "); },
    moveCount(board: Board): number { return board.split("").filter(c => c !== " ").length; },
    currentPlayer(board: Board, firstPlayer: PlayerMark): PlayerMark {
        return Board.moveCount(board) % 2 === 0 ? firstPlayer : (firstPlayer === "X" ? "O" : "X");
    },
    winner(board: Board): PlayerMark | null {
        for (const [a, b, c] of WINNING_LINES) {
            const ca = board[a];
            if (ca !== " " && ca === board[b] && ca === board[c]) return ca as PlayerMark;
        }
        return null;
    },
    winningLine(board: Board): readonly number[] | null {
        for (const line of WINNING_LINES) {
            const [a, b, c] = line;
            const ca = board[a];
            if (ca !== " " && ca === board[b] && ca === board[c]) return line;
        }
        return null;
    },
    isOver(board: Board): boolean { return Board.winner(board) !== null || Board.isFull(board); },
    play(board: Board, index: number, mark: PlayerMark): Board {
        return board.slice(0, index) + mark + board.slice(index + 1);
    },
    canPlay(board: Board, index: number): boolean {
        return !Board.isOver(board) && Board.cell(board, index) === " ";
    },
};

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/**
 * Cursor position expressed as fractions (0–1) of the board's width/height.
 * Using fractions makes the data resolution-independent; the renderer scales
 * them to pixels at display time.
 */
export type PresenceCursor = { readonly x: number; readonly y: number } | null;

/**
 * Fixed envelope IDs used for presence transients. Re-using the same ID
 * replaces the previous cursor position in the reconciling DB's transient
 * queue rather than accumulating entries, so each player's presence is a
 * single sliding entry at all times.
 */
export const PRESENCE_ID: Record<PlayerMark, number> = { X: 0xF001, O: 0xF002 };

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const tictactoePlugin = Database.Plugin.create({
    resources: {
        board: { default: Board.empty() },
        firstPlayer: { default: "X" as PlayerMark },
        // Presence: each player's cursor position on the board (null = not yet moved).
        cursorX: { default: null as PresenceCursor },
        cursorO: { default: null as PresenceCursor },
    },
    transactions: {
        playMove(t, args: { index: number }) {
            if (!Board.canPlay(t.resources.board, args.index)) return;
            const mark = Board.currentPlayer(t.resources.board, t.resources.firstPlayer);
            t.resources.board = Board.play(t.resources.board, args.index, mark);
        },
        restartGame(t) {
            // Alternate who goes first so the loser gets first move next round.
            t.resources.firstPlayer = t.resources.firstPlayer === "X" ? "O" : "X";
            t.resources.board = Board.empty();
        },
        /**
         * Update a player's cursor position. Called via `sendTransient` so it
         * is never committed — it stays in the reconciling DB's transient
         * queue and is overwritten on the next mouse move.
         *
         * Receiving peers apply it via `database.apply({ ..., time: -1 })`,
         * which runs this function transiently and notifies observers so the
         * UI can re-render the remote cursor dot.
         */
        movePresence(t, args: { mark: PlayerMark; x: number; y: number }) {
            if (args.mark === "X") {
                t.resources.cursorX = { x: args.x, y: args.y };
            } else {
                t.resources.cursorO = { x: args.x, y: args.y };
            }
        },
    },
});

export type TictactoeDatabase = Database.FromPlugin<typeof tictactoePlugin>;
