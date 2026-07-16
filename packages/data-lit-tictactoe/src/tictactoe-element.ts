// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { TictactoeDatabase } from "./database/tictactoe-database.js";

/**
 * Base class for all Tic-Tac-Toe elements. Typed on the minimal
 * `TictactoeDatabase` surface so that any database extending it (e.g. one that
 * adds AI agents or presence) can be injected as `.service`.
 */
export class TictactoeElement extends DatabaseElement<
  typeof TictactoeDatabase.plugin
> {
  get plugin() {
    return TictactoeDatabase.plugin;
  }
}
