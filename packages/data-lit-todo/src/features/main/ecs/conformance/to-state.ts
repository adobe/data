// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { Todo } from "../../data/todo/todo.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Todos
// are read in ascending `order` (the ecs materialisation of display order),
// each through its full `Todo` archetype so the row shape never aliases; only
// the spec fields (`id`, `name`, `complete`) are projected — the ecs-only
// `order` / `dragPosition` / `assignees` slots stay behind. Test-only.
const readTodos = (store: CoreDatabase.Store): Todo[] => {
  const todos: Todo[] = [];
  for (const entity of store.select(store.archetypes.Todo.components, { order: { order: true } })) {
    const row = store.read(entity, store.archetypes.Todo);
    if (row === null) throw new Error("conformance projection: expected a todo entity");
    todos.push({ id: row.id, name: row.name, complete: row.complete });
  }
  return todos;
};

export const toState = (store: CoreDatabase.Store): State => ({
  todos: readTodos(store),
  displayCompleted: store.resources.displayCompleted,
});
