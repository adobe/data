// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArchetypeDatabase } from "../../../archetype-database/archetype-database.js";
import { selectOrderedTodos } from "./select-ordered-todos.js";

/**
 * Rewrites every todo's `order` to a contiguous integer sequence (0, 1, 2, …)
 * based on its current sorted position. Call this after inserting a fractional
 * `order` value to collapse it back to clean integers.
 */
export const normalizeOrder = (t: ArchetypeDatabase.Store): void => {
  const ordered = selectOrderedTodos(t);
  ordered.forEach((entity, index) => {
    if (t.read(entity)?.order !== index) {
      t.update(entity, { order: index });
    }
  });
};
