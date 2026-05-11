// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { BoardState } from "../../types/board-state/board-state.js";
import { PlayerMark } from "../../types/player-mark/player-mark.js";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-hud.css.js";
import * as presentation from "./tictactoe-hud-presentation.js";

const tagName = "tictactoe-hud";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: TictactoeHudElement;
    }
}

@customElement(tagName)
export class TictactoeHudElement extends TictactoeElement {
    static styles = styles;

    render() {
        const values = useObservableValues(
            () => ({
                board: this.service.observe.resources.board,
                firstPlayer: this.service.observe.resources.firstPlayer,
                xWins: this.service.observe.resources.xWins,
                oWins: this.service.observe.resources.oWins,
                draws: this.service.observe.resources.draws,
            }),
            [],
        );

        const board = values?.board ?? "         ";
        const firstPlayer = values?.firstPlayer ?? PlayerMark.values[0];

        const currentPlayer = BoardState.currentPlayer(board, firstPlayer);
        const status = BoardState.deriveStatus(board);
        const winner = BoardState.getWinner(board);

        const statusText =
            status === "won" && winner !== null
                ? `${winner} wins!`
                : status === "draw"
                    ? "Draw!"
                    : `${currentPlayer}'s turn`;

        return presentation.render({
            statusText,
            xWins: values?.xWins ?? 0,
            oWins: values?.oWins ?? 0,
            draws: values?.draws ?? 0,
            restartGame: () => this.service.transactions.restartGame(),
        });
    }
}
