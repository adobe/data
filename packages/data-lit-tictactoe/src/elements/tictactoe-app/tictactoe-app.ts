// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { html } from "lit";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-app.css.js";
import "../tictactoe-board/tictactoe-board.js";
import "../tictactoe-hud/tictactoe-hud.js";

export const tagName = "tictactoe-app";

@customElement(tagName)
export class TictactoeApp extends TictactoeElement {
  static styles = styles;

  render() {
    return html`
      <tictactoe-board></tictactoe-board>
      <tictactoe-hud></tictactoe-hud>
    `;
  }
}
