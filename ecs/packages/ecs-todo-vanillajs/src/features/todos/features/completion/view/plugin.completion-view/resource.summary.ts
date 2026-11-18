// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoSummary } from "../../elements/index.js";

/** The page's summary of the counts; null until the page provides it. */
export const summary = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [summary]: { type: TodoSummary | null; thread: "main" };
    }
}
