// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/**
 * Internal mutable form of `PhysicsHit` used by the solver query
 * implementations. `castRay` fills a fresh one (retainable return value);
 * `castRayEach` fills and re-visits a single reused instance (zero-alloc).
 * Assignable to the public read-only `PhysicsHit` at the seam.
 */
export interface MutableHit {
    entity: Entity;
    distance: number;
    point: [number, number, number];
    normal: [number, number, number];
}

export const newHit = (): MutableHit => ({ entity: 0 as Entity, distance: 0, point: [0, 0, 0], normal: [0, 0, 0] });
