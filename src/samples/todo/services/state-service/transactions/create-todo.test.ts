// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createTodo } from './create-todo.js';
import { describe, expect, it } from 'vitest';

import { createTodoStore } from '../create-todo-store.js';

describe('createTodo', () => {
  describe('when creating a new todo', () => {
    it('should return the created todo entity id and create the todo', () => {
      const t = createTodoStore();
      const todoId = createTodo(t, { name: 'Buy groceries' });
      expect(todoId).toBeGreaterThanOrEqual(0);
      const values = t.read(todoId);
      expect(values).toEqual({ id: todoId, name: 'Buy groceries', dragPosition: null, complete: false, todo: true, order: 0 });
    });
  });
});
