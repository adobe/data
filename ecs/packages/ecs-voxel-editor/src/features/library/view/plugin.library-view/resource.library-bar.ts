// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LibraryBar } from "../../elements/index.js";

/** The page's library bar; null until the page provides it. */
export const libraryBar = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [libraryBar]: { type: LibraryBar | null; thread: "main" };
    }
}
