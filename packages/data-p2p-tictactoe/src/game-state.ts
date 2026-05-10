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
// Plugin
// ---------------------------------------------------------------------------

export const tictactoePlugin = Database.Plugin.create({
    resources: {
        board: { default: Board.empty() },
        firstPlayer: { default: "X" as PlayerMark },
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
    },
});

export type TictactoeDatabase = Database.FromPlugin<typeof tictactoePlugin>;
