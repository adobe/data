// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Todo } from "../../../data/todo/todo.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for a todo
// lives. Reused by the computed conformance to hydrate id-based computed outputs
// (e.g. `visibleTodos` returns entity ids) into the value shape a derivation
// yields, so those computeds need no bespoke projection. Test-only.
export const toData = (store: CoreDatabase.Store, entity: Entity): Todo => {
  const row = store.read(entity, store.archetypes.Todo);
  if (row === null) throw new Error("conformance projection: expected a todo entity");
  return { id: row.id, name: row.name, complete: row.complete };
};
