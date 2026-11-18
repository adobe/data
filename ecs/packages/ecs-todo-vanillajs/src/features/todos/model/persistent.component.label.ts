// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A todo's text. */
export const label = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [label]: { type: string };
    }
}
