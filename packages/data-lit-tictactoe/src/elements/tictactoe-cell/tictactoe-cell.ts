// © 2026 Adobe. MIT License. See /LICENSE for details.

import { customElement, property } from "lit/decorators.js";
import { useObservableValues } from "@adobe/data-lit";
import { BoardState } from "../../types/board-state/board-state.js";
import { TictactoeElement } from "../../tictactoe-element.js";
import { styles } from "./tictactoe-cell.css.js";
import * as presentation from "./tictactoe-cell-presentation.js";

export const tagName = "tictactoe-cell";

@customElement(tagName)
export class TictactoeCell extends TictactoeElement {
  static styles = styles;

  @property({ type: Number })
  declare index: number;

  render() {
    const values = useObservableValues(
      () => ({
        board: this.service.observe.resources.board,
      }),
      [],
    );

    const board = values?.board ?? "         ";
    const cell = BoardState.getCell(board, this.index);
    const isWinning = BoardState.isCellWinning(board, this.index);
    const isPlayable = BoardState.isCellPlayable(board, this.index);

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
