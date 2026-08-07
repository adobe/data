// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Seed a store to exactly match a `data/` `State`: clear every todo, set the
// `displayCompleted` resource, then insert the todos in display order. The
// inverse of `toState`. Test-only — the bridge that lets an ecs mutation be
// checked against the pure transform it stands for (see `expect-conforms.ts`).
//
// Clearing iterates tail→head so each delete is from the tail (no hole-fill
// shift). Todos are inserted in array (display) order with `order` = the index;
// the implementation-only slots (`dragPosition`, `assignees`) are seeded empty.
//
// The ecs assigns entity ids from its own quadrant-encoded id-space, unrelated
// to the spec's domain `id`. This returns the `spec id → seeded entity` map so the
// conformance runners resolve id-addressed operations generically
// (`Conformance.resolver`); nothing here assumes the two id-spaces coincide.
export const fromState = (
  store: CoreDatabase.Store,
  state: State,
): ReadonlyMap<number, Entity> => {
  for (const arch of store.queryArchetypes(store.archetypes.Todo.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      store.delete(arch.columns.id.get(row));
    }
  }
  store.resources.displayCompleted = state.displayCompleted;
  return new Map(
    state.todos.map((todo, index) => [
      todo.id,
      store.archetypes.Todo.insert({
        todo: true,
        name: todo.name,
        complete: todo.complete,
        order: index,
        dragPosition: null,
        assignees: [],
      }),
    ]),
  );
};
