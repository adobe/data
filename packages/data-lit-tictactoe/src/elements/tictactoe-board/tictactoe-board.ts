// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-board.css.js";
import * as presentation from "./tictactoe-board-presentation.js";
import "../tictactoe-cell/tictactoe-cell.js";

export const tagName = "tictactoe-board";

@customElement(tagName)
export class TictactoeBoard extends TictactoeElement {
  static styles = styles;

  render() {
    return presentation.render();
  }
}
