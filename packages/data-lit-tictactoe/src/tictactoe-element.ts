// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { tictactoePlugin } from "./state/tictactoe-plugin.js";

/**
 * Base class for all Tic-Tac-Toe elements. Typed on the minimal
 * `tictactoePlugin` surface so that any database extending that plugin (e.g.
 * one that adds AI agents or presence) can be injected as `.service`.
 */
export class TictactoeElement extends DatabaseElement<typeof tictactoePlugin> {
  get plugin() {
    return tictactoePlugin;
  }
}
