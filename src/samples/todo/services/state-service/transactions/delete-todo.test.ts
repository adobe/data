// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createTodo } from './create-todo.js';
import { deleteTodo } from './delete-todo.js';
import { describe, expect, it } from 'vitest';

import { createTodoStore } from '../create-todo-store.js';

describe('deleteTodo', () => {
  describe('when deleting a todo', () => {
    it('should remove it from the archetype', () => {
      const t = createTodoStore();
      const todoA = createTodo(t, { name: 'A' });
      const todoB = createTodo(t, { name: 'B' });
      const todoC = createTodo(t, { name: 'C' });
      deleteTodo(t, todoA);
      const values = t.read(todoA);
      expect(values).toBeNull();
      const valuesB = t.read(todoB);
      expect(valuesB).toBeDefined();
      const valuesC = t.read(todoC);
      expect(valuesC).toBeDefined();
      expect(t.archetypes.Todo.rowCount).toBe(2);
    });
  });
});
