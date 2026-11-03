// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoList } from "../elements/index.js";

/** The page's list, which rows are placed in; null until the page provides it. */
export const list = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [list]: { type: TodoList | null; thread: "main" };
    }
}
