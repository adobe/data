// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-board.css.js";
import * as presentation from "./tictactoe-board-presentation.js";

const tagName = "tictactoe-board";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: TictactoeBoardElement;
    }
}

@customElement(tagName)
export class TictactoeBoardElement extends TictactoeElement {
    static styles = styles;

    render() {
        return presentation.render();
    }
}
