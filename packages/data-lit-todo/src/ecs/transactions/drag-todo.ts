// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { CoreDatabase } from "../core-database.js";
import { normalizeOrder, selectOrderedTodos } from "./order/index.js";

export type DragTodoInput = {
  readonly entity: Entity;
  /** Live vertical pixel offset from the todo's resting position. */
  readonly dragPosition: number;
  /**
   * Target index within the currently visible list. Present only on the final
   * frame of a drag; while omitted the drag is still in progress.
   */
  readonly finalIndex?: number;
};

/**
 * Drives a drag-to-reorder gesture as a single coalesced transaction. While
 * dragging (no `finalIndex`) it records the live pixel offset in
 * `dragPosition`; on the final frame it drops the todo into place by assigning
 * a fractional `order` between its new visible neighbours, clears
 * `dragPosition`, then normalizes every todo back to contiguous integers.
 *
 * Intended to be driven by `useDragTransaction`, which invokes it with an
 * `AsyncArgsProvider` so all frames commit as one undoable step.
 */
export const dragTodo = (t: CoreDatabase.Store, input: DragTodoInput): void => {
  t.undoable = { coalesce: false };
  const { entity, dragPosition, finalIndex } = input;

  if (finalIndex === undefined) {
    t.update(entity, { dragPosition });
    return;
  }

  const ordered = selectOrderedTodos(t);
  const incompleteTodos = ordered.filter((e) => t.read(e)?.complete === false);
  const visible = t.resources.displayCompleted ? ordered : incompleteTodos;

  const withoutDragged = visible.filter((e) => e !== entity);
  const targetIndex = Math.max(0, Math.min(finalIndex, withoutDragged.length));

  const before = withoutDragged[targetIndex - 1];
  const after = withoutDragged[targetIndex];
  const beforeOrder = before === undefined ? undefined : t.read(before)?.order;
  const afterOrder = after === undefined ? undefined : t.read(after)?.order;

  const newOrder =
    beforeOrder === undefined && afterOrder === undefined
      ? 0
      : beforeOrder === undefined
        ? afterOrder! - 1
        : afterOrder === undefined
          ? beforeOrder + 1
          : (beforeOrder + afterOrder) / 2;

  t.update(entity, { dragPosition: null, order: newOrder });
  normalizeOrder(t);
};
