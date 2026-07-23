// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear every todo, set the
// `displayCompleted` resource, then insert the todos in display order. The
// inverse of `toState`. Test-only — the bridge that lets an ecs mutation be
// checked against the pure transform it stands for (see `expect-conforms.ts`).
//
// Clearing iterates tail→head so each delete is from the tail (no hole-fill
// shift). Todos are inserted in array (display) order with `order` = the index,
// and a fresh store assigns entity ids 1, 2, 3, … in that same order — so the
// entity id of the i-th todo equals its spec `id` when the cases number ids
// 1..N in display order. That identity is what lets an id-addressed transaction
// resolve its target and lets `toState` reproduce each todo's `id`. The
// implementation-only slots (`dragPosition`, `assignees`) are seeded empty.
export const fromState = (store: CoreDatabase.Store, state: State): void => {
  for (const arch of store.queryArchetypes(store.archetypes.Todo.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      store.delete(arch.columns.id.get(row));
    }
  }
  store.resources.displayCompleted = state.displayCompleted;
  state.todos.forEach((todo, index) => {
    store.archetypes.Todo.insert({
      todo: true,
      name: todo.name,
      complete: todo.complete,
      order: index,
      dragPosition: null,
      assignees: [],
    });
  });
};
