// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/schema";
import { Vec3, Quat, type Line3 } from "@adobe/data/math";
import { BodyType } from "./body/body-type/body-type.js";
import { ColliderShape } from "./body/collider-shape/collider-shape.js";
import type { ColliderMesh } from "./body/collider-mesh.js";
import { Material } from "../material/material.js";
import { RIGID_BODY_COMPONENTS } from "./rigid-body-components.js";
import { STATIC_COLLIDER_COMPONENTS } from "./static-collider-components.js";
import type { PhysicsQuery } from "./physics-query.js";
import type { PhysicsHit } from "./physics-hit.js";

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
 *
 * Besides the authored model, this seam declares the pluggable spatial-query
 * contract every solver fulfils: a `physicsQuery` resource (the active solver
 * publishes its engine-backed implementation once its world is live) and a
 * `pickRay` action that delegates to it — so ray/line picking is solver-agnostic.
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
        _prevPosition:   { ...Vec3.schema, nonPersistent: true }, // derived: pose before the last fixed step (render interpolation)
        _prevRotation:   { ...Quat.schema, nonPersistent: true },
        // Bodies sharing the same non-zero collisionGroup do not collide with each
        // other (they still collide with group 0 / the world) — e.g. a ragdoll's
        // bones. 0 = default (collide with everything). Honored by both solvers
        // (Rapier per-collider groups; Jolt a no-self-collide object layer). Note:
        // it's currently binary (group 0 vs "some non-zero group"), not per-id masks.
        collisionGroup:  F32.schema,
        // Authored collision geometry for shapes `halfExtents` can't describe.
        // Runtime objects (variable length, no schema): the solver reads them once
        // when it mirrors the body, the bridge once to build the render mesh.
        convexPoints:    { default: null as Float32Array | null }, // colliderShape "hull": point cloud → convex hull
        colliderMesh:    { default: null as ColliderMesh | null }, // colliderShape "mesh": static triangle soup
    },
    resources: {
        // The pluggable spatial-query seam: the active solver publishes its
        // engine-backed implementation here once its world is live, so picking
        // is solver-agnostic. Null before then (lazy WASM init) and when no
        // solver is combined in. Runtime object → nonPersistent.
        physicsQuery: { default: null as PhysicsQuery | null, nonPersistent: true },
    },
    archetypes: {
        RigidBody: [...RIGID_BODY_COMPONENTS],
        StaticCollider: [...STATIC_COLLIDER_COMPONENTS],
        // A convex-hull body (dynamic / kinematic): authored as a point cloud.
        ConvexBody: [...RIGID_BODY_COMPONENTS, "convexPoints"],
        // A static triangle-mesh collider (terrain / level geometry).
        MeshCollider: [...STATIC_COLLIDER_COMPONENTS, "colliderMesh"],
    },
    actions: {
        // Consumer surface for engine-backed picking. An action (not a
        // transaction) because it returns a value; a pure delegate to whatever
        // solver filled `physicsQuery` — `physicsData` itself holds no engine
        // knowledge. Returns null until a solver's world is live.
        pickRay(db, args: { ray: Line3; radius?: number }): PhysicsHit | null {
            return db.resources.physicsQuery?.castRay(args.ray, { radius: args.radius }) ?? null;
        },
        // Visit every collider along the ray, nearest first (see PhysicsQuery.castRayEach).
        // Returns void; no-op until a solver's world is live.
        pickRayEach(db, args: { ray: Line3; visit: (hit: PhysicsHit) => boolean | void; radius?: number }): void {
            db.resources.physicsQuery?.castRayEach(args.ray, args.visit, { radius: args.radius });
        },
    },
});
