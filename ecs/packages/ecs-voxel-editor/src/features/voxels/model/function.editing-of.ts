// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/ecs";
import type { Editing } from "./type.editing.js";

/** Editing `model`, from `root` through the instances of `chain`, at most eight of them, as deeply as instances are drawn. */
export const editingOf = (root: Entity, chain: readonly Entity[], model: Entity): Editing => {
    const at = (i: number): Entity => chain[i] ?? Entity.none;
    return { root, model, depth: Math.min(chain.length, 8), chain: [at(0), at(1), at(2), at(3), at(4), at(5), at(6), at(7)] };
};
