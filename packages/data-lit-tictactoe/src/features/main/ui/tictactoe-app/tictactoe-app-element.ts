// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { TictactoeElement } from "../tictactoe-element.js";
import { styles } from "./tictactoe-app.css.js";
import * as presentation from "./tictactoe-app-presentation.js";

const tagName = "tictactoe-app";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: TictactoeAppElement;
    }
}

@customElement(tagName)
export class TictactoeAppElement extends TictactoeElement {
    static styles = styles;

    render() {
        return presentation.render();
    }
}
