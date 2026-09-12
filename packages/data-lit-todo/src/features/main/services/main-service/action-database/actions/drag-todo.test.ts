// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import type { DragState } from "@adobe/data-lit";
import { ServiceDatabase } from "../../service-database/service-database.js";
import { dragTodo } from "./drag-todo.js";

// `dragTodo` is the "drag UI op" — conformance intentionally skips it (see
// `transactions.md`), so this is its only coverage. It is the one place the
// `useDragGenerator` → action → transaction mapping (including the cancel
// reset) actually lives.

// A stand-in row height; `services/` must not import the real UI constant.
const ROW_HEIGHT = 48;

async function* dragStates(...states: DragState[]): AsyncGenerator<DragState> {
  for (const state of states) yield state;
}

describe("dragTodo action", () => {
  it("streams a live offset on move, then reorders on the final drop", async () => {
    const db = Database.create(ServiceDatabase.plugin);
    const entity = db.transactions.createTodo({ name: "a" });
    const other = db.transactions.createTodo({ name: "b" });

    await dragTodo(db, {
      entity,
      index: 0,
      rowHeight: ROW_HEIGHT,
      drag: dragStates(
        { type: "move", delta: [0, 10], position: [0, 10] },
        {
          type: "end",
          delta: [0, ROW_HEIGHT],
          position: [0, ROW_HEIGHT],
        },
      ),
    });

    const after = db.read(entity);
    expect(after?.dragPosition).toBeNull();
    // dragged from index 0 to index 1 — now orders after "b".
    expect(after?.order).toBeGreaterThan(db.read(other)!.order!);
  });

  it("abandons the drag with no reorder on cancel", async () => {
    const db = Database.create(ServiceDatabase.plugin);
    const entity = db.transactions.createTodo({ name: "a" });
    const before = db.read(entity)!;

    await dragTodo(db, {
      entity,
      index: 0,
      rowHeight: ROW_HEIGHT,
      drag: dragStates(
        { type: "move", delta: [0, 10], position: [0, 10] },
        { type: "cancel" },
      ),
    });

    const after = db.read(entity);
    expect(after?.dragPosition).toBeNull();
    expect(after?.order).toBe(before.order);
  });
});
