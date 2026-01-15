// © 2026 Adobe. MIT License. See /LICENSE for details.
import { EntityReadValues, EntityUpdateValues } from "../../store/core/index.js";

export function patchEntityValues<C extends object>(
    a: EntityUpdateValues<C> | EntityReadValues<C> | null | undefined,
    b: EntityUpdateValues<C> | null,
) {
    if (!b) {
        return b;
    }
    if (!a) {
        return { ...b };
    }
    return { ...a, ...b };
}
