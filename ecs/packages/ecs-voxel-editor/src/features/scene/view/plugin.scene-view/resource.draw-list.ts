// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DrawList } from "./type.draw-list.js";

/** What a frame draws, replaced as it changes; null before there's a document. */
export const drawList = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [drawList]: { type: DrawList | null; thread: "world" };
    }
}
