// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DatabaseElement } from "@adobe/data-lit";
import { ComputedDatabase } from "../ecs/computed-database/computed-database.js";

/**
 * Base class for all Tic-Tac-Toe elements. Deliberately typed on the minimal
 * base-game surface (`ComputedDatabase`), NOT the assembled `FeatureDatabase`,
 * so any database that *extends* the base game can be injected as `.service` —
 * the standalone agent-extended app and the p2p presence build both do this.
 * (This is the sanctioned exception to "type consumers on `FeatureDatabase`":
 * an element meant to be extended types on the layer it actually consumes.)
 */
export class TictactoeElement extends DatabaseElement<
  typeof ComputedDatabase.plugin
> {
  get plugin() {
    return ComputedDatabase.plugin;
  }
}
