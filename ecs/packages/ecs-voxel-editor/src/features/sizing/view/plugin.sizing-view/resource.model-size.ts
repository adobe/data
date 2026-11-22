// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ModelSize } from "../../elements/index.js";

/** The page's model size panel; null until the page provides it. */
export const modelSize = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [modelSize]: { type: ModelSize | null; thread: "main" };
    }
}
