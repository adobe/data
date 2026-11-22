// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The page's undo and redo buttons; null until the page provides them. */
export const historyButtons = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [historyButtons]: { type: { readonly undo: HTMLElement; readonly redo: HTMLElement } | null; thread: "main" };
    }
}
