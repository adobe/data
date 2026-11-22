// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The document's file: its path in the library, or null for one not yet saved. */
export const document = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [document]: { type: { readonly path: string | null }; default: { path: null }; thread: "main" };
    }
}
