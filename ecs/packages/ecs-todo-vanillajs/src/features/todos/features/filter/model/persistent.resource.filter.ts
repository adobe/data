// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Filter } from "./internal/type.filter.js";

/** Which todos the list shows. */
export const filter = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [filter]: { type: Filter; default: "all" };
    }
}
