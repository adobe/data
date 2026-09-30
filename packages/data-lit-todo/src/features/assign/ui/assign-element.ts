// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { MainService } from "../ecs/main-service.js";

/**
 * Base class for the assign feature's elements. Typed on the feature's own
 * plugin — on first connect, `DatabaseElement` walks up to the ancestor (main)
 * database and `extend`s it with this plugin, lazily adding the User archetype,
 * both indexes, the transactions, computeds and actions to the shared live database.
 */
export class AssignElement extends DatabaseElement<typeof MainService.plugin> {
  get plugin() {
    return MainService.plugin;
  }
}
