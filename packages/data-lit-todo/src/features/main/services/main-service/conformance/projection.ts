// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { Todo } from "../../../data/todo/todo.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for a todo
// lives. Reused by the computed conformance to hydrate id-based computed outputs
// (e.g. `visibleTodos` returns entity ids) into the value shape a derivation
// yields, so those computeds need no bespoke projection. Test-only.
const toData = (store: CoreDatabase.Store, entity: Entity): Todo => {
  const row = store.read(entity, store.archetypes.Todo);
  if (row === null)
    throw new Error("conformance projection: expected a todo entity");
  // `id` is the entity itself (reads no longer echo it back as a component).
  return { id: entity, name: row.name, complete: row.complete };
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State` (clearing every todo, setting the
// `displayCompleted` resource, then inserting the todos in display order with
// `order` = the index; the implementation-only slots (`dragPosition`,
// `assignees`) are seeded empty). Clearing iterates tail→head so each delete is
// from the tail (no hole-fill shift). The ecs assigns entity ids from its own
// id-space, unrelated to the spec's domain `id`; `fromState` returns the `spec id
// → seeded entity` map so the runners resolve id-addressed operations generically.
// `toState` reads it back (todos in ascending `order`, each through its full
// archetype so the row shape never aliases; only the spec fields are projected);
// `toData` reads one entity.
export const projection = {
  fromState: (
    store: CoreDatabase.Store,
    state: State,
  ): ReadonlyMap<number, Entity> => {
    for (const arch of store.queryArchetypes(
      store.archetypes.Todo.components,
    )) {
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
  },
  toState: (store: CoreDatabase.Store): State => ({
    todos: [
      ...store.select(store.archetypes.Todo.components, {
        order: { order: true },
      }),
    ].map((entity) => toData(store, entity)),
    displayCompleted: store.resources.displayCompleted,
  }),
  toData,
};
