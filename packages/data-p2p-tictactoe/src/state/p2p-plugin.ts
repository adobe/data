// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerMark = "X" | "O";
export type Cell = " " | PlayerMark;

/**
 * Cursor position as fractions [0–1] of board width/height — resolution-independent.
 * null means the player hasn't moved their pointer over the board yet.
 */
export type PresenceCursor = { readonly x: number; readonly y: number } | null;

/**
 * Fixed envelope IDs for presence transients. Re-using the same ID per player
 * replaces the previous cursor entry in the reconciling DB's transient queue
 * rather than accumulating — so each player's presence is a single sliding
 * entry at all times.
 */
export const PRESENCE_ID: Record<PlayerMark, number> = { X: 0xF001, O: 0xF002 };

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
] as const;

export const Board = {
    empty: (): string => "         ",
    cell: (board: string, i: number): Cell => (board[i] ?? " ") as Cell,
    isFull: (board: string): boolean => !board.includes(" "),
    moveCount: (board: string): number => board.split("").filter(c => c !== " ").length,
    currentPlayer: (board: string, first: PlayerMark): PlayerMark =>
        Board.moveCount(board) % 2 === 0 ? first : (first === "X" ? "O" : "X"),
    winner: (board: string): PlayerMark | null => {
        for (const [a, b, c] of WINNING_LINES) {
            const ca = board[a];
            if (ca !== " " && ca === board[b] && ca === board[c]) return ca as PlayerMark;
        }
        return null;
    },
    winningLine: (board: string): readonly number[] | null => {
        for (const line of WINNING_LINES) {
            const [a, b, c] = line;
            const ca = board[a];
            if (ca !== " " && ca === board[b] && ca === board[c]) return line;
        }
        return null;
    },
    isOver: (board: string): boolean => Board.winner(board) !== null || Board.isFull(board),
    canPlay: (board: string, i: number): boolean =>
        !Board.isOver(board) && Board.cell(board, i) === " ",
    play: (board: string, i: number, mark: PlayerMark): string =>
        board.slice(0, i) + mark + board.slice(i + 1),
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const p2pPlugin = Database.Plugin.create({
    resources: {
        board: { default: Board.empty() },
        firstPlayer: { default: "X" as PlayerMark },
        cursorX: { default: null as PresenceCursor },
        cursorO: { default: null as PresenceCursor },
    },
    computed: {
        currentPlayer: (db) =>
            Observe.withFilter(
                db.observe.resources.board,
                (board) => Board.currentPlayer(board, db.resources.firstPlayer),
            ),
        winner: (db) =>
            Observe.withFilter(db.observe.resources.board, Board.winner),
        isOver: (db) =>
            Observe.withFilter(db.observe.resources.board, Board.isOver),
        winningLine: (db) =>
            Observe.withFilter(db.observe.resources.board, Board.winningLine),
    },
    transactions: {
        playMove(t, args: { index: number }) {
            if (!Board.canPlay(t.resources.board, args.index)) return;
            const mark = Board.currentPlayer(t.resources.board, t.resources.firstPlayer);
            t.resources.board = Board.play(t.resources.board, args.index, mark);
        },
        restartGame(t) {
            t.resources.firstPlayer = t.resources.firstPlayer === "X" ? "O" : "X";
            t.resources.board = Board.empty();
        },
        /**
         * Update a player's cursor position (always sent via sendTransient,
         * never committed). Applied with time=-1, so it stays in the
         * reconciling DB's transient queue and is overwritten on the next move.
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

export type P2pDatabase = Database.FromPlugin<typeof p2pPlugin>;
