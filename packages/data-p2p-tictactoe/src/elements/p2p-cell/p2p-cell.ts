// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement, property } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { BoardState } from "../../types/board-state/board-state.js";
import { P2pElement } from "../p2p-element.js";
import { styles } from "./p2p-cell.css.js";
import * as presentation from "./p2p-cell-presentation.js";

export const tagName = "p2p-cell";

@customElement(tagName)
export class P2pCell extends P2pElement {
    static styles = styles;

    @property({ type: Number })
    index!: number;

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
        const cell = BoardState.getCell(board, this.index);
        const currentPlayer = BoardState.currentPlayer(board, firstPlayer);
        const winningLine = BoardState.getWinningLine(board);
        const isWinning = winningLine !== null && (winningLine as readonly number[]).includes(this.index);
        const isPlayable = cell === " " && currentPlayer === this.myMark && !BoardState.isGameOver(board);

        return presentation.render({
            cell,
            isWinning,
            isPlayable,
            playMove: () => {
                this.service.transactions.playMove({ index: this.index });
            },
        });
    }
}
