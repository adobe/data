// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { FeatureDatabase } from "../ecs/feature-database.js";

/**
 * Base class for all todo elements. Typed on the assembled `FeatureDatabase`
 * plugin surface so every child element can read computed values off `.service`
 * and dispatch `.service.actions.*` (which orchestrate analytics + transactions).
 */
export class TodoElement extends DatabaseElement<typeof FeatureDatabase.plugin> {
  get plugin() {
    return FeatureDatabase.plugin;
  }
}
