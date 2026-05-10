// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { BoardState } from "../../types/board-state/board-state.js";
import { P2pElement } from "../p2p-element.js";
import { styles } from "./p2p-hud.css.js";
import * as presentation from "./p2p-hud-presentation.js";

export const tagName = "p2p-hud";

@customElement(tagName)
export class P2pHud extends P2pElement {
    static styles = styles;

    render() {
        const values = useObservableValues(
            () => ({
                board: this.service.observe.resources.board,
                firstPlayer: this.service.observe.resources.firstPlayer,
            }),
            [],
        );

        const board = values?.board ?? BoardState.createInitialBoard();
        const firstPlayer = values?.firstPlayer ?? "X";
        const currentPlayer = BoardState.currentPlayer(board, firstPlayer);
        const winner = BoardState.getWinner(board);
        const isOver = BoardState.isGameOver(board);
        const myTurn = !isOver && currentPlayer === this.myMark;

        let statusText: string;
        if (winner !== null) {
            statusText = winner === this.myMark ? "You win! 🎉" : "You lose.";
        } else if (BoardState.isBoardFull(board)) {
            statusText = "Draw!";
        } else {
            statusText = myTurn
                ? `Your turn (${this.myMark})`
                : `Waiting for opponent (${currentPlayer})…`;
        }

        return presentation.render({
            myMark: this.myMark,
            statusText,
            myTurn,
            isOver,
            restartGame: () => {
                this.service.transactions.restartGame();
            },
        });
    }
}
