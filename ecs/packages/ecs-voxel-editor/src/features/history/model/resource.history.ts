// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { History } from "./internal/type.history.js";

/** The edit history, which undo and redo go through: null until the first state is recorded. Replaced as it changes. */
export const history = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [history]: { type: History | null; thread: "main" };
    }
}
