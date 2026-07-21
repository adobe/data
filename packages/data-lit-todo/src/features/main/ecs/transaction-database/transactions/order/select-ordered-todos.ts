// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ArchetypeDatabase } from "../../../archetype-database/archetype-database.js";

/**
 * Returns every todo entity in ascending `order`, matching the sequence the
 * user sees in the list.
 */
export const selectOrderedTodos = (t: ArchetypeDatabase.Store): readonly Entity[] =>
  t.select(t.archetypes.Todo.components, { order: { order: true } });
