// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// Move a todo to `toIndex` — the programmatic counterpart of the drag UI (which
// dispatches the richer `dragTodo` transaction directly). Reproduces
// `State.reorderTodo` as a single final-drop `dragTodo` commit, so it is the
// same-named action that conforms the `reorderTodo` transition.
export const reorderTodo = (
  db: ServiceDatabase,
  { id, toIndex }: { id: Entity; toIndex: number },
) => {
  db.transactions.dragTodo({
    entity: id,
    dragPosition: 0,
    finalIndex: toIndex,
  });
};
