// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Vec3, Quat } from "@adobe/data/math";
import type { ColliderShape } from "./collider-shape/collider-shape.js";

/**
 * One row of the `StaticCollider` archetype — an immovable collider (floor,
 * wall, ramp, arbitrary scenery). Dynamic bodies collide with it, but the
 * solver never integrates it, so it carries no velocity columns: a lean
 * representation for the bulk-static workload (many static, few dynamic).
 *
 * It is the same authored surface as a `RigidBody` minus `bodyType` (the
 * archetype *is* the "static" classification) and the velocity components.
 * Friction / restitution / compliance come from its `material`, exactly as for
 * a dynamic body. Like a RigidBody, its `position`/`rotation` double as the
 * renderable transform (the render bridge gives it geometry).
 */
export interface StaticCollider {
    colliderShape: ColliderShape;
    /** Box extents on all axes; sphere radius in `.x`. */
    halfExtents: Vec3;
    /** Reference to a Material registry entity (physical + visible props). */
    material: Entity;
    position: Vec3;
    /** Unified with Node.rotation so the collider is directly renderable. */
    rotation: Quat;
}
