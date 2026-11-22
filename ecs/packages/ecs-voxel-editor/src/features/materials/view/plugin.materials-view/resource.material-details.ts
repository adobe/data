// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MaterialDetails } from "../../elements/index.js";

/** The page's material details; null until the page provides them. */
export const materialDetails = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [materialDetails]: { type: MaterialDetails | null; thread: "main" };
    }
}
