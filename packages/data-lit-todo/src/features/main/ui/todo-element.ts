// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { ActionDatabase } from "../ecs/action-database/action-database.js";

/**
 * Base class for all todo elements. Typed on the top `ActionDatabase` plugin
 * surface so every child element can read computed values off `.service` and
 * dispatch `.service.actions.*` (which orchestrate analytics + transactions).
 */
export class TodoElement extends DatabaseElement<typeof ActionDatabase.plugin> {
  get plugin() {
    return ActionDatabase.plugin;
  }
}
