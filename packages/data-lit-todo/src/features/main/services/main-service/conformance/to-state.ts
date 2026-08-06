// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../../data/state/state.js";
import type { Todo } from "../../../data/todo/todo.js";
import type { CoreDatabase } from "../core-database/core-database.js";
import { toData } from "./to-data.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. Todos
// are read in ascending `order` (the ecs materialisation of display order),
// each through its full `Todo` archetype so the row shape never aliases; only
// the spec fields (`id`, `name`, `complete`) are projected — the ecs-only
// `order` / `dragPosition` / `assignees` slots stay behind. The projected `id`
// is the entity id (the ecs's own id-space, not the spec's domain id), so
// cases author `after` ids as `anyNumber`, so the comparison leaves them open.
// Test-only.
const readTodos = (store: CoreDatabase.Store): Todo[] =>
  [...store.select(store.archetypes.Todo.components, { order: { order: true } })].map((entity) =>
    toData(store, entity),
  );

export const toState = (store: CoreDatabase.Store): State => ({
  todos: readTodos(store),
  displayCompleted: store.resources.displayCompleted,
});
