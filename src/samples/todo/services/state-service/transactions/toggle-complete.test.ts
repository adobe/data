/*************************************************************************
 *
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2025 Adobe
 *  All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 **************************************************************************/
import { createTodo } from './create-todo.js';
import { toggleComplete } from './toggle-complete.js';
import { describe, expect, it } from 'vitest';

import { createTodoStore } from '../create-todo-store.js';

describe('toggleComplete', () => {
  describe('when toggling a complete todo', () => {
    it('should mark it as incomplete', () => {
      const t = createTodoStore();
      const todoId = createTodo(t, { name: 'Test todo' });
      // First mark as complete
      t.update(todoId, { complete: true });
      expect(t.read(todoId)?.complete).toBe(true);

      // Then toggle it
      toggleComplete(t, todoId);
      expect(t.read(todoId)?.complete).toBe(false);
    });
  });

  describe('when toggling an incomplete todo', () => {
    it('should mark it as complete', () => {
      const t = createTodoStore();
      const todoId = createTodo(t, { name: 'Test todo' });
      expect(t.read(todoId)?.complete).toBe(false);

      toggleComplete(t, todoId);
      expect(t.read(todoId)?.complete).toBe(true);
    });
  });

  describe('when toggling multiple times', () => {
    it('should alternate between complete and incomplete', () => {
      const t = createTodoStore();
      const todoId = createTodo(t, { name: 'Test todo' });
      expect(t.read(todoId)?.complete).toBe(false);

      // First toggle
      toggleComplete(t, todoId);
      expect(t.read(todoId)?.complete).toBe(true);

      // Second toggle
      toggleComplete(t, todoId);
      expect(t.read(todoId)?.complete).toBe(false);

      // Third toggle
      toggleComplete(t, todoId);
      expect(t.read(todoId)?.complete).toBe(true);
    });
  });

  describe('when toggling a non-existent todo', () => {
    it('should not throw an error and should no-op', () => {
      const t = createTodoStore();
      const nonExistentId = 999;
      expect(t.read(nonExistentId)).toBeNull();

      // Should not throw
      expect(() => toggleComplete(t, nonExistentId)).not.toThrow();

      // Should still be null
      expect(t.read(nonExistentId)).toBeNull();
    });
  });

  describe('when toggling with invalid entity id', () => {
    it('should not throw an error and should no-op', () => {
      const t = createTodoStore();
      const invalidId = -1;

      // Should not throw
      toggleComplete(t, invalidId);
      expect(() => toggleComplete(t, invalidId)).not.toThrow();
    });
  });
});
