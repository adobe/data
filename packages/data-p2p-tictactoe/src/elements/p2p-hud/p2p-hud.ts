// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { Board } from "../../state/p2p-plugin.js";
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

        const board = values?.board ?? Board.empty();
        const firstPlayer = values?.firstPlayer ?? "X";
        const currentPlayer = Board.currentPlayer(board, firstPlayer);
        const winner = Board.winner(board);
        const isOver = Board.isOver(board);
        const myTurn = !isOver && currentPlayer === this.myMark;

        let statusText: string;
        if (winner !== null) {
            statusText = winner === this.myMark ? "You win! 🎉" : "You lose.";
        } else if (Board.isFull(board)) {
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
                this.syncClient.propose({
                    id: Date.now(),
                    name: "restartGame",
                    args: {},
                    time: -1,
                    userId: this.myMark,
                });
            },
        });
    }
}
