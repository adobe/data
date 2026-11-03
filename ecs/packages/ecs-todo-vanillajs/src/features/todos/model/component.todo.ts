// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks an entity as a todo. */
export const todo = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [todo]: { type: true };
    }
}
