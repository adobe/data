// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Reactive game view: subscribes to the database and re-renders on change.
// Presence cursors are tracked via pointermove → sendTransient and rendered
// as overlay dots on the board for the remote player.

import type { SyncClient } from "@adobe/data-sync";
import { Board, PRESENCE_ID, type PresenceCursor, type TictactoeDatabase, type PlayerMark } from "./game-state.js";
import { el } from "./ui.js";

let envelopeId = 0;
const nextId = () => ++envelopeId;

/**
 * Mount and continuously update the game UI.
 * Call once when the P2P connection is established.
 *
 * Layout (persistent — never torn down until page unload):
 *
 *   #app
 *   └── .game
 *       ├── .game__header   (rebuilt on game-state change)
 *       ├── .board-wrap     (persistent; position: relative)
 *       │   ├── .board      (rebuilt on game-state change)
 *       │   └── .cursors    (rebuilt on cursor-resource change)
 *       └── .game__footer   (rebuilt on game-state change)
 *
 * Keeping `.board-wrap` persistent lets us attach the pointermove listener
 * once and track the board's bounding box reliably across re-renders.
 *
 * @param db       The fully initialised TictactoeDatabase
 * @param client   The SyncClient wired to the transport
 * @param myMark   Which mark this player plays ("X" or "O")
 */
export const mountGameView = (
    db: TictactoeDatabase,
    client: SyncClient,
    myMark: PlayerMark,
): void => {
    // -----------------------------------------------------------------------
    // Build the persistent game scaffold
    // -----------------------------------------------------------------------
    const app = document.getElementById("app")!;
    app.innerHTML = "";

    const header   = el("div", { class: "game__header" });
    const boardWrap = el("div", { class: "board-wrap" });
    const footer   = el("div", { class: "game__footer" });
    const gameEl   = el("div", { class: "game" });

    gameEl.appendChild(header);
    gameEl.appendChild(boardWrap);
    gameEl.appendChild(footer);
    app.appendChild(gameEl);

    // -----------------------------------------------------------------------
    // Presence: send my cursor position as a transient on every pointermove.
    //
    // We attach the listener to the persistent boardWrap so it survives
    // game-state re-renders. Coordinates are stored as fractions (0–1) of the
    // board's width/height to be resolution-independent.
    //
    // Using a fixed envelope ID per player means each new position replaces
    // the previous entry in the reconciling DB's transient queue rather than
    // accumulating — the remote peer always sees only the latest position.
    // -----------------------------------------------------------------------
    const presenceId = PRESENCE_ID[myMark];

    boardWrap.addEventListener("pointermove", (e: PointerEvent) => {
        const rect = boardWrap.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        // sendTransient: applied locally (transient) + forwarded to peers.
        // Never committed — stays in the transient queue until overwritten.
        client.sendTransient({
            id: presenceId,
            name: "movePresence",
            args: { mark: myMark, x, y },
            time: -1,
        });
    });

    // -----------------------------------------------------------------------
    // Game render: header + board + footer
    // -----------------------------------------------------------------------
    const renderGame = () => {
        const board = db.resources.board;
        const firstPlayer = db.resources.firstPlayer;
        const currentPlayer = Board.currentPlayer(board, firstPlayer);
        const winner = Board.winner(board);
        const isOver = Board.isOver(board);
        const winningLine = Board.winningLine(board);
        const myTurn = !isOver && currentPlayer === myMark;

        // Status text
        let statusText: string;
        if (winner !== null) {
            statusText = winner === myMark ? "You win! 🎉" : "You lose.";
        } else if (Board.isFull(board)) {
            statusText = "Draw!";
        } else {
            statusText = myTurn
                ? `Your turn (${myMark})`
                : `Waiting for opponent (${currentPlayer})…`;
        }

        // Header
        header.innerHTML = "";
        header.appendChild(el("span", { class: "game__badge" }, `You are ${myMark}`));
        header.appendChild(
            el("span", { class: `game__status${myTurn ? " game__status--active" : ""}` }, statusText),
        );

        // Board grid — preserve the existing .cursors overlay if present
        const existingCursors = boardWrap.querySelector<HTMLElement>(".cursors");
        boardWrap.innerHTML = "";
        boardWrap.appendChild(buildBoard(board, winningLine, myTurn, myMark, (index) => {
            client.propose({
                id: nextId(),
                name: "playMove",
                args: { index },
                time: -1,
                userId: myMark,
            });
        }));
        // Re-attach the cursor overlay (or create it fresh on first render)
        boardWrap.appendChild(existingCursors ?? el("div", { class: "cursors" }));

        // Footer
        footer.innerHTML = "";
        if (isOver) {
            footer.appendChild(buildRestartButton(() => {
                client.propose({
                    id: nextId(),
                    name: "restartGame",
                    args: {},
                    time: -1,
                    userId: myMark,
                });
            }));
        }

        // Re-render cursors so their positions are in sync with the new board geometry.
        renderCursors();
    };

    // -----------------------------------------------------------------------
    // Cursor render: remote player's dot overlay
    //
    // Only the REMOTE player's cursor is shown — the local player can see
    // their own OS cursor. We read from the ECS resource that was updated by
    // the received transient envelope.
    // -----------------------------------------------------------------------
    const renderCursors = () => {
        const cursorsEl = boardWrap.querySelector<HTMLElement>(".cursors");
        if (!cursorsEl) return;
        cursorsEl.innerHTML = "";

        const otherMark: PlayerMark = myMark === "X" ? "O" : "X";
        const otherCursor: PresenceCursor =
            otherMark === "X" ? db.resources.cursorX : db.resources.cursorO;

        if (otherCursor) {
            // Clamp to [0, 1] so the dot never escapes the board even if the
            // cursor briefly leaves the element before the 'pointerleave' fires.
            const cx = Math.max(0, Math.min(1, otherCursor.x));
            const cy = Math.max(0, Math.min(1, otherCursor.y));
            cursorsEl.appendChild(buildCursorDot(otherMark, cx, cy));
        }
    };

    // -----------------------------------------------------------------------
    // Subscribe to state changes
    // -----------------------------------------------------------------------
    const unsubBoard    = db.observe.resources.board(() => renderGame());
    const unsubFirst    = db.observe.resources.firstPlayer(() => renderGame());
    const unsubCursorX  = db.observe.resources.cursorX(() => renderCursors());
    const unsubCursorO  = db.observe.resources.cursorO(() => renderCursors());

    // Initial render
    renderGame();

    // Clean up on page unload
    window.addEventListener("beforeunload", () => {
        unsubBoard();
        unsubFirst();
        unsubCursorX();
        unsubCursorO();
        client.dispose();
    });
};

// ---------------------------------------------------------------------------
// DOM builders
// ---------------------------------------------------------------------------

const buildBoard = (
    board: string,
    winningLine: readonly number[] | null,
    myTurn: boolean,
    myMark: PlayerMark,
    onPlay: (index: number) => void,
): HTMLElement => {
    const grid = el("div", { class: "board" });
    for (let i = 0; i < 9; i++) {
        const cell = Board.cell(board, i);
        const isWin = winningLine?.includes(i) ?? false;
        const isEmpty = cell === " ";
        const playable = isEmpty && myTurn;

        const cellEl = el(
            "button",
            {
                class: [
                    "cell",
                    cell !== " " ? `cell--${cell.toLowerCase()}` : "",
                    isWin ? "cell--winning" : "",
                    playable ? "cell--playable" : "",
                ].filter(Boolean).join(" "),
                ...(playable ? {} : { disabled: "" }),
                "aria-label": isEmpty ? `Cell ${i + 1}` : cell,
            },
            cell !== " " ? cell : "",
        );

        if (playable) {
            cellEl.addEventListener("click", () => onPlay(i));
        }

        grid.appendChild(cellEl);
    }
    return grid;
};

const buildRestartButton = (onRestart: () => void): HTMLElement => {
    const btn = el("button", { class: "btn btn--restart" }, "Play again");
    btn.addEventListener("click", onRestart);
    return btn;
};

/**
 * A small labeled dot representing the remote player's cursor.
 * Positioned using percentage coordinates so it scales with the board.
 */
const buildCursorDot = (mark: PlayerMark, x: number, y: number): HTMLElement => {
    return el("div", {
        class: `cursor cursor--${mark.toLowerCase()}`,
        style: `left:${x * 100}%;top:${y * 100}%`,
        "aria-label": `${mark} cursor`,
    }, mark);
};
