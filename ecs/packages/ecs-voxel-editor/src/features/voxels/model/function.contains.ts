// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** Whether `outer` is `inner`, or holds it through instances placed within it, however deeply. */
export const contains = (outer: Entity, inner: Entity, placedIn: (model: Entity) => readonly Entity[]): boolean => {
    const seen = new Set<Entity>();
    const visit = (model: Entity): boolean => {
        if (model === inner) return true;
        if (seen.has(model)) return false;
        seen.add(model);
        return placedIn(model).some(visit);
    };
    return visit(outer);
};
