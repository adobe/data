// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { DragState } from "@adobe/data-lit";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// `useDragGenerator` hands us the raw pointer stream; this action maps each
// yielded `DragState` frame to the `dragTodo` transaction's args and drives
// the transaction directly with that mapped async generator, so every frame —
// including the final drop — commits as one coalesced, undoable step. A
// cancelled gesture yields a `dragPosition: null` frame with no `finalIndex`,
// which abandons the drag without reordering.
//
// `rowHeight` is a UI layout measure passed in by the caller (never imported —
// `services/` must not depend on `ui/`), used to convert the final pixel offset
// into a list-index delta.
export const dragTodo = (
  db: ServiceDatabase,
  args: {
    readonly entity: Entity;
    readonly index: number;
    readonly rowHeight: number;
    readonly drag: AsyncGenerator<DragState>;
  },
) => {
  const { entity, index, rowHeight, drag } = args;
  return db.transactions.dragTodo(async function* () {
    for await (const state of drag) {
      if (state.type === "move") {
        yield { entity, dragPosition: state.delta[1] };
      } else if (state.type === "end") {
        yield {
          entity,
          dragPosition: state.delta[1],
          finalIndex: index + Math.round(state.delta[1] / rowHeight),
        };
      } else if (state.type === "cancel") {
        yield { entity, dragPosition: null };
      }
    }
  });
};
