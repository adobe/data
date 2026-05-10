// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerMark = "X" | "O";
export type Cell = " " | PlayerMark;

/**
 * Local-only screen the peer is currently on. Stored as an ephemeral
 * resource so it never reaches the wire — only the local UI reads it.
 */
export type Phase = "idle" | "host-signaling" | "join-signaling" | "game";

/**
 * Cursor position as fractions [0–1] of board width/height — resolution-
 * independent. `null` means the player hasn't moved their pointer over the
 * board yet.
 */
export type PresenceCursor = { readonly x: number; readonly y: number } | null;

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
        // ── Synced game state — replicated to the peer by createSyncService ──
        board: { default: Board.empty() },
        firstPlayer: { default: "X" as PlayerMark },
        cursorX: { default: null as PresenceCursor },
        cursorO: { default: null as PresenceCursor },

        // ── Ephemeral local state — `ephemeral: true` marks them as
        //    purely local: createSyncService skips envelopes whose
        //    TransactionResult.ephemeral === true, so these never reach
        //    the wire. ──
        phase:       { default: "idle" as Phase, ephemeral: true },
        offerCode:   { default: "" as string,   ephemeral: true },
        answerCode:  { default: "" as string,   ephemeral: true },
        bannerText:  { default: "" as string,   ephemeral: true },
        bannerError: { default: false as boolean, ephemeral: true },
        myMark:      { default: null as PlayerMark | null, ephemeral: true },
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
        // ── Local UI transitions — touch only ephemeral resources, so
        //    createSyncService skips them and they stay on this peer. ──

        startHostSignaling(t) {
            t.resources.phase = "host-signaling";
            t.resources.bannerText = "Generating invite code — please wait…";
            t.resources.bannerError = false;
        },
        startJoinSignaling(t) {
            t.resources.phase = "join-signaling";
            t.resources.bannerText = "";
            t.resources.bannerError = false;
        },
        setOfferCode(t, { code }: { code: string }) {
            t.resources.offerCode = code;
            t.resources.bannerText = "";
        },
        setAnswerCode(t, { code }: { code: string }) {
            t.resources.answerCode = code;
            t.resources.bannerText = "";
        },
        setBanner(t, { text, error = false }: { text: string; error?: boolean }) {
            t.resources.bannerText = text;
            t.resources.bannerError = error;
        },
        connected(t, { myMark }: { myMark: PlayerMark }) {
            t.resources.myMark = myMark;
            t.resources.phase = "game";
        },

        // ── Synced game transactions — touch the synced resources, so
        //    createSyncService forwards them through the WebRTC channel. ──

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
         * Update a player's cursor position. Invoked once with an async
         * generator that never returns: each yield becomes a transient
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

export type P2pDatabase = Database.FromPlugin<typeof p2pPlugin>;
