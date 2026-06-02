// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3, Quat } from "@adobe/data/math";
import { BodyType } from "./body/body-type/body-type.js";
import { ColliderShape } from "./body/collider-shape/collider-shape.js";
import { Material } from "./material/material.js";

/**
 * The shared, solver-agnostic rigid-body data model — the seam every physics
 * solver plugs into. It declares *only* authored/canonical state (no systems):
 *
 *   bodyType, colliderShape, halfExtents, material  — authored shape + role
 *   position, orientation, linearVelocity, angularVelocity — canonical live state
 *
 * A **solver plugin** `extends` this, may keep its own private `_`-prefixed
 * internal state (broadphase, caches, GPU buffers), and each frame reads the
 * authored state and writes back `position`/`orientation`/velocity for dynamic
 * bodies. Static bodies are colliders only (never integrated); kinematic bodies
 * are driven externally. A renderer reads the canonical transforms, decoupled
 * from which solver produced them — so solvers (CPU-XPBD now, the shelved GPU
 * one or Rapier later) are interchangeable over identical authored scenes.
 *
 * Mass + inertia are derived per solver from shape + material (not stored here).
 */
export const physicsData = Database.Plugin.create({
    components: {
        bodyType:        BodyType.schema,
        colliderShape:   ColliderShape.schema,
        halfExtents:     Vec3.schema,   // box extents; sphere radius in .x
        material:        Material.schema,
        position:        Vec3.schema,
        orientation:     Quat.schema,
        linearVelocity:  Vec3.schema,
        angularVelocity: Vec3.schema,
    },
    archetypes: {
        RigidBody: ["bodyType", "colliderShape", "halfExtents", "material", "position", "orientation", "linearVelocity", "angularVelocity"],
    },
});
