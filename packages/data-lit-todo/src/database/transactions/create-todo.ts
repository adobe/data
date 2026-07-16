// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";
import { nextOrder } from "../order/index.js";

export const createTodo = (
  t: CoreDatabase.Store,
  input: { readonly name: string; readonly complete?: boolean },
) =>
  t.archetypes.Todo.insert({
    todo: true,
    name: input.name,
    complete: input.complete ?? false,
    order: nextOrder(t),
    dragPosition: null,
  });
