// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Counts edits to materials' names and looks, so what shows them, as swatches and thumbnails do, can redraw after a
 * pass that changed one; materials added or removed show in their index instead.
 */
export const materialsRevision = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [materialsRevision]: { type: number; default: 0 };
    }
}
