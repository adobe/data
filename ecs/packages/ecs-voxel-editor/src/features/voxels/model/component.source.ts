// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a referenced model is kept: its file's path in the library, which saving writes it back to. */
export const source = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [source]: { type: string };
    }
}
