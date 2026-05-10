// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../types/board-state/board-state.js";
import type { PlayerMark } from "../types/player-mark/player-mark.js";
import type { PresenceCursor } from "../types/presence-cursor/presence-cursor.js";


export const gamePlugin = Database.Plugin.create({
    resources: {
        board:       { default: BoardState.createInitialBoard() },
        firstPlayer: { default: "X" as PlayerMark },
        cursorX:     { default: null as PresenceCursor },
        cursorO:     { default: null as PresenceCursor },
    },
    computed: {
        currentPlayer: (db) =>
            Observe.withFilter(
                db.observe.resources.board,
                (board) => BoardState.currentPlayer(board, db.resources.firstPlayer),
            ),
        winner: (db) =>
            Observe.withFilter(db.observe.resources.board, BoardState.getWinner),
        isOver: (db) =>
            Observe.withFilter(db.observe.resources.board, BoardState.isGameOver),
        winningLine: (db) =>
            Observe.withFilter(db.observe.resources.board, BoardState.getWinningLine),
    },
    transactions: {
        playMove(t, args: { index: number }) {
            if (!BoardState.canPlay(t.resources.board, args.index)) return;
            const mark = BoardState.currentPlayer(t.resources.board, t.resources.firstPlayer);
            t.resources.board = BoardState.play(t.resources.board, args.index, mark);
        },
        restartGame(t) {
            t.resources.firstPlayer = t.resources.firstPlayer === "X" ? "O" : "X";
            t.resources.board = BoardState.createInitialBoard();
        },
        /**
         * Update a player's cursor position. Called once with an async
         * generator that never resolves: each yield becomes a transient
         * envelope (negative time) which the sync service forwards as
         * `kind: "transient"`. The peer applies it as a transient too, and
         * the next yield with the same `(userId, id)` key replaces the
         * previous one — so each peer has at most one outstanding cursor
         * sample at any time.
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
