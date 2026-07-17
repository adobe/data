// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { ComputedDatabase } from "../ecs/computed-database.js";

/**
 * Base class for all Tic-Tac-Toe elements. Typed on the minimal
 * `ComputedDatabase` surface so that any database extending it (e.g. one that
 * adds AI agents or presence) can be injected as `.service`.
 */
export class TictactoeElement extends DatabaseElement<
  typeof ComputedDatabase.plugin
> {
  get plugin() {
    return ComputedDatabase.plugin;
  }
}
