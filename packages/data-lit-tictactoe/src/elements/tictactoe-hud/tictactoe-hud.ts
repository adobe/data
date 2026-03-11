// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { BoardState } from "../../types/board-state/board-state.js";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-hud.css.js";
import * as presentation from "./tictactoe-hud-presentation.js";

export const tagName = "tictactoe-hud";

@customElement(tagName)
export class TictactoeHud extends TictactoeElement {
  static styles = styles;

  render() {
    const values = useObservableValues(
      () => ({
        board: this.service.observe.resources.board,
        firstPlayer: this.service.observe.resources.firstPlayer,
      }),
      [],
    );

    const board = values?.board ?? "         ";
    const firstPlayer = values?.firstPlayer ?? "X";

    const currentPlayer = BoardState.currentPlayer(board, firstPlayer);
    const status = BoardState.deriveStatus(board);
    const winner = BoardState.getWinner(board);

    const statusText =
      status === "won" && winner !== null
        ? `Winner: ${winner}`
        : status === "draw"
          ? "Draw"
          : `Current Player: ${currentPlayer}`;

    return presentation.render({
      statusText,
      restartGame: () => this.service.transactions.restartGame(),
    });
  }
}
