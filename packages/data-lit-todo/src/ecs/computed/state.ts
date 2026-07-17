// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import type { State } from "../../data/state/state.js";
import type { IndexDatabase } from "../index-database.js";

// The full logical `State` projected from the ECS — the conformance anchor
// between the data-layer spec and this implementation. The `order` component
// collapses into array position and the transient `dragPosition` is dropped;
// neither exists in the spec.
export const state = cached((db: IndexDatabase) =>
  db.derive((read): State => {
    const rows = read
      .select(db.archetypes.Todo.components)
      .map((id) => ({ id, values: read.read(id) }))
      .filter((row) => row.values !== undefined)
      .sort((a, b) => (a.values!.order ?? 0) - (b.values!.order ?? 0));
    return {
      todos: rows.map(({ id, values }) => ({
        id,
        name: values!.name ?? "",
        complete: values!.complete ?? false,
      })),
      displayCompleted: read.resources.displayCompleted,
    };
  }),
);
