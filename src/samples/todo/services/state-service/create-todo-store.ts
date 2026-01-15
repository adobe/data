// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from '../../../../ecs/store/index.js';
import { F32, True } from '../../../../schema/index.js';
import { Schema } from '../../../../schema/index.js';

// Increment this value if you change the schema in a non-backwards compatible way
export const todoStoreSchemaVersion = 1;
export const createTodoStore = () => {
  return Store.create({
    components: {
      todo: True.schema, // a tag that indicates an entity is a todo item.
      complete: { type: 'boolean' },
      name: { type: 'string' },
      order: F32.schema,
      dragPosition: Schema.Nullable(F32.schema), // null = not being dragged
    },
    resources: {
      displayCompleted: { type: 'boolean', default: false },
    },
    archetypes: {
      Todo: ['todo', 'complete', 'name', 'order', 'dragPosition'],
    }
  });
};

export type TodoStore = ReturnType<typeof createTodoStore>;
