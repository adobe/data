// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Vec3, Quat } from "@adobe/data/math";
import type { BodyType } from "./body-type/body-type.js";
import type { ColliderShape } from "./collider-shape/collider-shape.js";

/**
 * One row of the `RigidBody` archetype — the authored surface every physics
 * solver reads, and whose `position`/`orientation`/velocity it writes back each
 * frame. Mass and inertia are *derived* from `colliderShape` + `halfExtents` +
 * `material` (see ColliderShape.massProperties), so they aren't stored here.
 */
export interface RigidBody {
    bodyType: BodyType;
    colliderShape: ColliderShape;
    /** Box extents on all axes; sphere radius in `.x`. */
    halfExtents: Vec3;
    /** Reference to a Material registry entity (physical + visible props). */
    material: Entity;
    position: Vec3;
    orientation: Quat;
    linearVelocity: Vec3;
    angularVelocity: Vec3;
}
