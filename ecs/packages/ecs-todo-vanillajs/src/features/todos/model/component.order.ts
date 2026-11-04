// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a todo sits in the list: todos are listed by ascending order. */
export const order = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [order]: { type: number };
    }
}
