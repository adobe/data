// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import type { State } from "../../../../data/state/state.js";
import type { Todo } from "../../../../data/todo/todo.js";
import type { IndexDatabase } from "../../index-database/index-database.js";

// The full logical `State` projected from the ECS — the conformance anchor
// between the data-layer spec and this implementation. Each entity is keyed by its
// id in `entities` and carries its `order`; the transient `dragPosition` is
// dropped (it has no place in the spec).
export const state = cached((db: IndexDatabase) =>
  Observe.withCache(db.derive((read): State => {
    const rows = read
      .select(db.archetypes.Todo.components)
      .map((id) => ({ id, values: read.read(id) }))
      .filter((row) => row.values !== undefined);
    return {
      entities: new Map<number, Todo>(
        rows.map(({ id, values }) => [
          id,
          {
            name: values!.name ?? "",
            complete: values!.complete ?? false,
            order: values!.order ?? 0,
          },
        ]),
      ),
      displayCompleted: read.resources.displayCompleted,
    };
  })),
);
