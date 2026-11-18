// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TodoFilters } from "../../elements/index.js";

/** The page's filter buttons; null until the page provides them. */
export const filters = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [filters]: { type: TodoFilters | null; thread: "main" };
    }
}
