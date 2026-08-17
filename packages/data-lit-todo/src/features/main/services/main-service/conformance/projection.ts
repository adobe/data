// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { State } from "../../../data/state/state.js";
import type { Todo } from "../../../data/todo/todo.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its id-less `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for a todo
// lives. Reused by the computed conformance to hydrate id-based computed outputs
// (e.g. `visibleTodos` returns entity ids) into the value shape a derivation
// yields, so those computeds need no bespoke projection. Identity is the map key,
// so no `id` is projected. Test-only.
const toData = (store: CoreDatabase.Store, entity: Entity): Todo => {
  const row = store.read(entity, store.archetypes.Todo);
  if (row === null)
    throw new Error("conformance projection: expected a todo entity");
  return { name: row.name, complete: row.complete, order: row.order };
};

// The test-only ecs↔`State` projection, passed to `Conformance.runFeature`.
// `fromState` seeds a store to a `State` (clearing every todo, setting the
// `displayCompleted` resource, then inserting each entity with its own `order`;
// the implementation-only slots (`dragPosition`, `assignees`) and the `todo` tag
// are seeded here). Clearing iterates tail→head so each delete is from the tail
// (no hole-fill shift). The ecs assigns entity ids from its own id-space, unrelated
// to the spec's domain id; `fromState` returns the `spec id → seeded entity` map so
// the runners resolve id-addressed operations generically. `toState` reads it back
// (todos keyed by the assigned entity, each through its full archetype so the row
// shape never aliases; only the spec fields are projected); `toData` reads one
// entity.
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
    const seeded = new Map(
      [...state.entities].map(([specId, todo]) => [
        specId,
        store.archetypes.Todo.insert({
          todo: true,
          name: todo.name,
          complete: todo.complete,
          order: todo.order,
          dragPosition: null,
          assignees: [],
        }),
      ]),
    );
    // Resolve the `selectedTodo` REFERENCE (a spec-id) to the entity just seeded for
    // it — the ecs mints its own ids, so the resource must hold the ecs id, not the
    // spec-id. An unresolved reference (or none) collapses to `Entity.none`.
    store.resources.selectedTodo = seeded.get(state.selectedTodo) ?? Entity.none;
    return seeded;
  },
  toState: (store: CoreDatabase.Store): State => ({
    displayCompleted: store.resources.displayCompleted,
    entities: new Map<number, Todo>(
      store
        .select(store.archetypes.Todo.components, { order: { order: true } })
        .map((entity) => [entity, toData(store, entity)]),
    ),
    selectedTodo: store.resources.selectedTodo,
  }),
  toData,
};
