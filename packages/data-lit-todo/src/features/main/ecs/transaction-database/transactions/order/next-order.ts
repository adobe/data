// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArchetypeDatabase } from "../../../archetype-database/archetype-database.js";
import { selectOrderedTodos } from "./select-ordered-todos.js";

/**
 * The `order` value to assign to a newly created todo so that it sorts after
 * every existing todo.
 */
export const nextOrder = (t: ArchetypeDatabase.Store): number => {
  const ordered = selectOrderedTodos(t);
  const last = ordered[ordered.length - 1];
  if (last === undefined) return 0;
  return (t.read(last)?.order ?? -1) + 1;
};
