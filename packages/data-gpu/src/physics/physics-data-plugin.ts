// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3, Quat } from "@adobe/data/math";
import { BodyType } from "./body/body-type/body-type.js";
import { ColliderShape } from "./body/collider-shape/collider-shape.js";
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
    },
    archetypes: {
        RigidBody: ["bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"],
        StaticCollider: ["colliderShape", "halfExtents", "material", "position", "rotation"],
    },
});
