// © 2026 Adobe. MIT License. See /LICENSE for details.
import { reorderTodos } from './reorder-todos.js';
import type { Entity } from "@adobe/data/ecs";

import { type TodoStore } from '../create-todo-store.js';

export const dragTodo = (t: TodoStore, props: { todo: Entity; dragPosition: number; finalIndex?: number }) => {
  t.undoable = { coalesce: false };
  const { todo, dragPosition, finalIndex } = props;
  const completed = finalIndex !== undefined;
  if (!completed) {
    t.update(todo, { dragPosition });
  } else {
    // insert it with an order value 0.5 less than the final index
    t.update(todo, { dragPosition: null, order: finalIndex - 0.5 });
    // then we call reorderTodos which will reorder everything to integer order values
    reorderTodos(t); // this is an example of calling another transaction from a transaction
  }
};
