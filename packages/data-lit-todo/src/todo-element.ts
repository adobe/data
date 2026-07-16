// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DatabaseElement } from "@adobe/data-lit";
import { TodoDatabase } from "./database/todo-database.js";

/**
 * Base class for all todo elements. Typed on the combined `TodoDatabase`
 * plugin surface so every child element can read computed values and
 * dispatch transactions off the injected `.service`.
 */
export class TodoElement extends DatabaseElement<typeof TodoDatabase.plugin> {
  get plugin() {
    return TodoDatabase.plugin;
  }
}
