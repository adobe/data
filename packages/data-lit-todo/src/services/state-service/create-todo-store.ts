// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Store } from "@adobe/data/ecs";
import { F32, True, Schema } from "@adobe/data/schema";

// Increment this value if you change the schema in a non-backwards compatible way
export const todoStoreSchemaVersion = 1;

export const todoStoreSchema = {
  components: {
    todo: True.schema, // a tag that indicates an entity is a todo item.
    complete: { type: 'boolean' as const },
    name: { type: 'string' as const },
    order: F32.schema,
    dragPosition: Schema.Nullable(F32.schema), // null = not being dragged
  },
  resources: {
    displayCompleted: { type: 'boolean' as const, default: false },
  },
  archetypes: {
    Todo: ['todo', 'complete', 'name', 'order', 'dragPosition'],
  }
} as const;

export const createTodoStore = () => {
  return Store.create(todoStoreSchema);
};

export type TodoStore = ReturnType<typeof createTodoStore>;
