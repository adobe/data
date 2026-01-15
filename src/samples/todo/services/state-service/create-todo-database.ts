// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createTodoStore } from './create-todo-store.js';
import { Database } from '../../../../ecs/index.js';

import * as actions from './transactions/index.js';

export const createTodoDatabase = () => {
  const store = createTodoStore();
  const database = Database.create(store, actions);
  return database;
};

export type TodoDatabase = ReturnType<typeof createTodoDatabase>;
