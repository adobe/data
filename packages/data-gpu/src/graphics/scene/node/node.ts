// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Quat, Vec3 } from "@adobe/data/math";

/**
 * One entity in the Node archetype — a transform-hierarchy slot. Each field
 * is its own ECS component (typed-buffer column), but the Node shape names
 * the bundle so consumers can declare typed locals like
 * `const node: Node = arch.read(i)`.
 *
 * `_worldMatrix` is *not* on the authored Node — the `transform` system
 * adds it later, migrating each entity into a wider archetype.
 */
export interface Node {
    position: Vec3;
    rotation: Quat;
    scale:    Vec3;
    parent:   Entity;
    visible:  boolean;
}

export * as Node from "./public.js";
