// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A material's name, as a user sees it. */
export const name = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [name]: { type: string };
    }
}
