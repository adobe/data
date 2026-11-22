// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks an entity as a selected face. */
export const face = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [face]: { type: true };
    }
}
