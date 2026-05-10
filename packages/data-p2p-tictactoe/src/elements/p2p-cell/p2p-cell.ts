// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement, property } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { Board } from "../../state/p2p-plugin.js";
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

        const board = values?.board ?? Board.empty();
        const firstPlayer = values?.firstPlayer ?? "X";
        const cell = Board.cell(board, this.index);
        const currentPlayer = Board.currentPlayer(board, firstPlayer);
        const isWinning = (Board.winningLine(board) ?? []).includes(this.index);
        const isPlayable = cell === " " && currentPlayer === this.myMark && !Board.isOver(board);

        return presentation.render({
            cell,
            isWinning,
            isPlayable,
            playMove: () => {
                this.syncClient.propose({
                    id: Date.now(),
                    name: "playMove",
                    args: { index: this.index },
                    time: -1,
                    userId: this.myMark,
                });
            },
        });
    }
}
