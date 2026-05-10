// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Reactive game view: subscribes to the database and re-renders on change.

import type { SyncClient } from "@adobe/data-sync";
import { Board, type TictactoeDatabase, type PlayerMark } from "./game-state.js";
import { el, setScreen } from "./ui.js";

let envelopeId = 0;
const nextId = () => ++envelopeId;

/**
 * Mount and continuously update the game UI.
 * Call once when the P2P connection is established.
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
    const render = () => {
        const board = db.resources.board;
        const firstPlayer = db.resources.firstPlayer;
        const currentPlayer = Board.currentPlayer(board, firstPlayer);
        const winner = Board.winner(board);
        const isOver = Board.isOver(board);
        const winningLine = Board.winningLine(board);
        const myTurn = !isOver && currentPlayer === myMark;

        // Status line
        let statusText: string;
        if (winner !== null) {
            statusText = winner === myMark ? "You win! 🎉" : "You lose.";
        } else if (Board.isFull(board)) {
            statusText = "Draw!";
        } else {
            statusText = myTurn ? `Your turn (${myMark})` : `Waiting for opponent (${currentPlayer})…`;
        }

        // Build the screen element
        const screen = el("div", { class: "game" },
            el("div", { class: "game__header" },
                el("span", { class: "game__badge" }, `You are ${myMark}`),
                el("span", { class: `game__status${myTurn ? " game__status--active" : ""}` }, statusText),
            ),
            buildBoard(board, winningLine, myTurn, myMark, (index) => {
                client.propose({
                    id: nextId(),
                    name: "playMove",
                    args: { index },
                    time: -1,
                    userId: myMark,
                });
            }),
            isOver
                ? buildRestartButton(() => {
                    client.propose({
                        id: nextId(),
                        name: "restartGame",
                        args: {},
                        time: -1,
                        userId: myMark,
                    });
                })
                : el("div", {}),
        );

        setScreen(screen);
    };

    // Subscribe to board changes. Observe<T> is a function: observe(callback) → unsubscribe.
    const unsubBoard = db.observe.resources.board(() => render());
    const unsubFirst = db.observe.resources.firstPlayer(() => render());

    // Initial render.
    render();

    // Clean up on page unload.
    window.addEventListener("beforeunload", () => {
        unsubBoard();
        unsubFirst();
        client.dispose();
    });
};

// ---------------------------------------------------------------------------
// Board DOM builder
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
