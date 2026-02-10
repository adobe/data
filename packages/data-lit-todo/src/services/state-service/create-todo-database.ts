// © 2026 Adobe. MIT License. See /LICENSE for details.
import { todoStoreSchema } from './create-todo-store.js';
import { Database } from "@adobe/data/ecs";

import * as transactions from './transactions/index.js';

export const createTodoDatabase = () => {
  return Database.create(Database.Plugin.create({
    components: todoStoreSchema.components,
    resources: todoStoreSchema.resources,
    archetypes: todoStoreSchema.archetypes,
    transactions,
  }));
};

export type TodoDatabase = ReturnType<typeof createTodoDatabase>;
