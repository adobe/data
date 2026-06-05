// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/schema";
import { Vec3, Quat } from "@adobe/data/math";
import { BodyType } from "./body/body-type/body-type.js";
import { ColliderShape } from "./body/collider-shape/collider-shape.js";
import type { ColliderMesh } from "./body/collider-mesh.js";
import { Material } from "../material/material.js";

/**
 * The shared, solver-agnostic rigid-body data model — the seam every physics
 * solver plugs into. It declares *only* authored/canonical state (no systems):
 *
 *   bodyType, colliderShape, halfExtents, material  — authored shape + role
 *   position, rotation, linearVelocity, angularVelocity — canonical live state
 *
 * A **solver plugin** `extends` this, may keep its own private `_`-prefixed
 * internal state (broadphase, caches, GPU buffers), and each frame reads the
 * authored state and writes back `position`/`rotation`/velocity for dynamic
 * bodies. A renderer reads the canonical transforms, decoupled from which
 * solver produced them — so solvers (`joltSolver`, `rapierSolver`; the GPU XPBD
 * solver is shelved) are interchangeable over identical authored scenes.
 *
 * Two archetypes share these components:
 *   - **RigidBody** — `dynamic` or `kinematic` bodies that move; carries
 *     velocities and a `bodyType` discriminator.
 *   - **StaticCollider** — immovable colliders (floor, wall, ramp, scenery).
 *     No velocities (never integrated) and no `bodyType` (the archetype *is*
 *     the static classification) — a lean row for the bulk-static workload.
 *
 * `_prevPosition`/`_prevRotation` are derived (`_`-prefixed): the solver snapshots
 * the pose *before* its final fixed step into them, so a render-rate interpolation
 * pass can smoothly blend the previous → current simulated pose (see
 * `physics-clock-plugin` + `interpolation-plugin`). Like `_worldMatrix`, they are
 * *not* in the authored archetype — the solver migrates them onto each dynamic
 * body the first time it mirrors it, so authors never supply derived state.
 *
 * Mass + inertia are derived per solver from shape + material (not stored here).
 */
export const physicsData = Database.Plugin.create({
    extends: Material.plugin,   // brings the `material` reference component
    components: {
        bodyType:        BodyType.schema,
        colliderShape:   ColliderShape.schema,
        halfExtents:     Vec3.schema,   // box extents; sphere radius in .x
        position:        Vec3.schema,
        rotation:        Quat.schema, // unified with Node.rotation so a body renders directly
        linearVelocity:  Vec3.schema,
        angularVelocity: Vec3.schema,
        _prevPosition:   Vec3.schema, // derived: pose before the last fixed step (render interpolation)
        _prevRotation:   Quat.schema,
        // Bodies sharing the same non-zero collisionGroup do not collide with each
        // other (they still collide with group 0 / the world) — e.g. a ragdoll's
        // bones. 0 = default (collide with everything). Honored by rapierSolver;
        // joltSolver support is a follow-up (see README).
        collisionGroup:  F32.schema,
        // Authored collision geometry for shapes `halfExtents` can't describe.
        // Runtime objects (variable length, no schema): the solver reads them once
        // when it mirrors the body, the bridge once to build the render mesh.
        convexPoints:    { default: null as Float32Array | null }, // colliderShape "hull": point cloud → convex hull
        colliderMesh:    { default: null as ColliderMesh | null }, // colliderShape "mesh": static triangle soup
    },
    archetypes: {
        RigidBody: ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"],
        StaticCollider: ["colliderShape", "halfExtents", "material", "position", "rotation"],
        // A convex-hull body (dynamic / kinematic): authored as a point cloud.
        ConvexBody: ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity", "convexPoints"],
        // A static triangle-mesh collider (terrain / level geometry).
        MeshCollider: ["colliderShape", "halfExtents", "material", "position", "rotation", "colliderMesh"],
    },
});
