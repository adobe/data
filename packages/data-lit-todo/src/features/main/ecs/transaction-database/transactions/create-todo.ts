// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArchetypeDatabase } from "../../archetype-database/archetype-database.js";
import { nextOrder } from "./order/index.js";

export const createTodo = (
  t: ArchetypeDatabase.Store,
  input: { readonly name: string; readonly complete?: boolean },
) =>
  t.archetypes.Todo.insert({
    todo: true,
    name: input.name,
    complete: input.complete ?? false,
    order: nextOrder(t),
    dragPosition: null,
    assignees: [],
  });
