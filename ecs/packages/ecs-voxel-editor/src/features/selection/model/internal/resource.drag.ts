// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Drag } from "./type.drag.js";

/** The selecting drag under way, or null between drags. */
export const drag = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [drag]: { type: Drag | null; thread: "main" };
    }
}
