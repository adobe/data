// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LibraryAccess } from "./type.library-access.js";

/** The `PluginConfig` name of what reaches the library's folder, a `LibraryAccess`, which views call as the user asks. */
export const libraryAccess = Symbol();

declare module "@adobe/ecs" {
    interface PluginConfig {
        [libraryAccess]: LibraryAccess;
    }
}
