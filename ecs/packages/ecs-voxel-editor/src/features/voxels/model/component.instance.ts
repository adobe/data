// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks an entity as an instance: a model placed within another. */
export const instance = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [instance]: { type: true };
    }
}
