// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement, property } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { TictactoeElement } from "../tictactoe-element.js";
import { styles } from "./tictactoe-cell.css.js";
import { observeCell } from "./observe-cell.js";
import * as presentation from "./tictactoe-cell-presentation.js";

const tagName = "tictactoe-cell";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: TictactoeCellElement;
    }
}

@customElement(tagName)
export class TictactoeCellElement extends TictactoeElement {
    static styles = styles;

    @property({ type: Number })
    declare index: number;

    render() {
        const values = useObservableValues(
            () => ({ view: observeCell(this.service, this.index) }),
            [this.index],
        );
        const view = values?.view;

        return presentation.render({
            cell: view?.cell ?? " ",
            isWinning: view?.isWinning ?? false,
            isPlayable: view?.isPlayable ?? false,
            playMove: () => {
                this.service.transactions.playMove({ index: this.index });
            },
        });
    }
}
