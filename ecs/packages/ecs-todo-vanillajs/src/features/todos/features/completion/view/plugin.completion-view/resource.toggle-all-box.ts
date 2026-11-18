// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoToggleAll } from "../../elements/index.js";

/** The page's toggle-all checkbox; null until the page provides it. */
export const toggleAllBox = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [toggleAllBox]: { type: TodoToggleAll | null; thread: "main" };
    }
}
