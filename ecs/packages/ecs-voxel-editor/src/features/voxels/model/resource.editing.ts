// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Editing } from "./type.editing.js";

/** Which model is being edited, and through which instances; the root none before there's a document. */
export const editing = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [editing]: { type: Editing };
    }
}
