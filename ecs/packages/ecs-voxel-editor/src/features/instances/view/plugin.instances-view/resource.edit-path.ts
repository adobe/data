// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { EditPath } from "../../elements/index.js";

/** The page's path to the model being edited; null until the page provides it. */
export const editPath = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [editPath]: { type: EditPath | null; thread: "main" };
    }
}
