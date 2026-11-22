// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Library } from "./type.library.js";

/** The library, replaced as it changes. */
export const library = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [library]: { type: Library; default: { folder: null; state: "none"; entries: []; message: null }; thread: "main" };
    }
}
