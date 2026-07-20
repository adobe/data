// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { ComputedDatabase } from "../ecs/computed-database/computed-database.js";

/**
 * Base class for the assign feature's elements. Typed on the feature's own
 * plugin — on first connect, `DatabaseElement` walks up to the ancestor (main)
 * database and `extend`s it with this plugin, lazily adding the User archetype,
 * both indexes, and the transactions to the shared live database.
 */
export class AssignElement extends DatabaseElement<typeof ComputedDatabase.plugin> {
  get plugin() {
    return ComputedDatabase.plugin;
  }
}
