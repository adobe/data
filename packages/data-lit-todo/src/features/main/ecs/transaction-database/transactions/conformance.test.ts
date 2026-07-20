// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Conformance: every ECS transaction must produce the same logical `State` as
// its `data/` spec transform. The `state` computed projects the ECS back to
// `State`; we compare modulo entity id (ids are opaque and assigned
// differently by the two sides), i.e. by ordered {name, complete} + displayCompleted.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { State } from "../../../data/state/state.js";
import { state as stateComputed } from "../../computed-database/computed/state.js";
import { ComputedDatabase } from "../../computed-database/computed-database.js";

const read = (db: ComputedDatabase): State => {
  let value!: State;
  const unsub = stateComputed(db)((v) => { value = v; });
  unsub?.();
  return value;
};

const view = (s: State) => ({
  todos: s.todos.map((t) => ({ name: t.name, complete: t.complete })),
  displayCompleted: s.displayCompleted,
});

const seeded = () => {
  const db = Database.create(ComputedDatabase.plugin);
  db.transactions.createTodo({ name: "a" });
  db.transactions.createTodo({ name: "b", complete: true });
  db.transactions.createTodo({ name: "c" });
  return db;
};

describe("ECS transactions conform to the data/ State spec", () => {
  it("createTodo", () => {
    const db = seeded();
    const before = read(db);
    db.transactions.createTodo({ name: "d", complete: true });
    expect(view(read(db))).toEqual(view(State.createTodo(before, { name: "d", complete: true })));
  });

  it("createBulkTodos", () => {
    const db = seeded();
    const before = read(db);
    db.transactions.createBulkTodos({ count: 3 });
    expect(view(read(db))).toEqual(view(State.createBulkTodos(before, { count: 3 })));
  });

  it("deleteTodo", () => {
    const db = seeded();
    const before = read(db);
    const id = before.todos[1].id;
    db.transactions.deleteTodo(id);
    expect(view(read(db))).toEqual(view(State.deleteTodo(before, { id })));
  });

  it("deleteAllTodos", () => {
    const db = seeded();
    const before = read(db);
    db.transactions.deleteAllTodos();
    expect(view(read(db))).toEqual(view(State.deleteAllTodos(before)));
  });

  it("toggleComplete", () => {
    const db = seeded();
    const before = read(db);
    const id = before.todos[0].id;
    db.transactions.toggleComplete(id);
    expect(view(read(db))).toEqual(view(State.toggleComplete(before, { id })));
  });

  it("toggleDisplayCompleted", () => {
    const db = seeded();
    const before = read(db);
    db.transactions.toggleDisplayCompleted();
    expect(view(read(db))).toEqual(view(State.toggleDisplayCompleted(before)));
  });

  it("dragTodo (final drop) conforms to reorderTodo", () => {
    const db = seeded(); // a, c incomplete + b complete; drag over the full list
    db.transactions.toggleDisplayCompleted(); // show all so visible order == full order
    const before = read(db);
    const id = before.todos[0].id;
    db.transactions.dragTodo({ entity: id, dragPosition: 0, finalIndex: 2 });
    expect(view(read(db))).toEqual(view(State.reorderTodo(before, { id, toIndex: 2 })));
  });
});
