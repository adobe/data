// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Whether a todo is done. */
export const done = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [done]: { type: boolean };
    }
}
