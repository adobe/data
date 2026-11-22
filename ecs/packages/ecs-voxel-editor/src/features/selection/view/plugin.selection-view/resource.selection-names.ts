// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SelectionNames } from "../../elements/index.js";

/** The page's list of saved selections; null until the page provides it. */
export const selectionNames = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [selectionNames]: { type: SelectionNames | null; thread: "main" };
    }
}
