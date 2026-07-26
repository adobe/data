// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Vec3 } from "@adobe/data/math";

/**
 * One physics ray-pick result — the body/collider the ray hit plus the
 * geometry of the hit the engine's broadphase can give that an AABB scan
 * cannot.
 *
 * `distance` uses the same parametric convention as the graphics `PickHit`
 * (α ∈ [0,1] along the `Line3` segment, 0 = near point `a`, 1 = far point
 * `b`), so `PhysicsHit` is a structural superset of `PickHit` and `distance`
 * reads the same in both picking systems. The absolute hit location is `point`.
 */
export interface PhysicsHit {
    readonly entity: Entity;
    readonly distance: number;  // parametric α ∈ [0,1] along the ray segment
    readonly point: Vec3;       // world-space hit point = a + (b − a)·distance
    readonly normal: Vec3;      // unit surface normal at the hit, oriented to oppose the ray
}
