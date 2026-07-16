// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database.js";

/**
 * Returns every todo entity in ascending `order`, matching the sequence the
 * user sees in the list.
 */
export const selectOrderedTodos = (t: CoreDatabase.Store): readonly Entity[] =>
  t.select(t.archetypes.Todo.components, { order: { order: true } });
