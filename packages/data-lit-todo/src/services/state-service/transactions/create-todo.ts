// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type TodoStore } from '../create-todo-store.js';

export const createTodo = (t: TodoStore, props: { name: string; complete?: boolean }) => {
  t.undoable = { coalesce: false };
  const order = t.archetypes.Todo.rowCount;
  // TODO: Figure out why the order seems to be zero on each added row.
  return t.archetypes.Todo.insert({
    ...props,
    complete: props.complete ?? false,
    todo: true,
    order,
    dragPosition: null,
  });
};
