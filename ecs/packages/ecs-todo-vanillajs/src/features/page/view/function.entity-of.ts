// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/ecs";
import { shownBy } from "./shared/function.shown-by.js";

/**
 * The entity the first target on an event's composed path shows, from where it was dispatched outward, or none when no
 * target shows one. Read while the event dispatches, as listeners do: the path is empty after.
 */
export const entityOf = (event: Event): Entity => {
    const path = event.composedPath();
    for (let k = 0; k < path.length; k++) {
        const found = shownBy(path[k] ?? null);
        if (found !== Entity.none) return found;
    }
    return Entity.none;
};
