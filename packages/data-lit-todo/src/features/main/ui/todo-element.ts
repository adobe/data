// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { MainService } from "../services/main-service/main-service.js";

/**
 * Base class for all todo elements. Typed on the assembled `MainService`
 * plugin surface so every child element can read computed values off `.service`
 * and dispatch `.service.actions.*` (which orchestrate analytics + transactions).
 */
export class TodoElement extends DatabaseElement<typeof MainService.plugin> {
  get plugin() {
    return MainService.plugin;
  }
}
