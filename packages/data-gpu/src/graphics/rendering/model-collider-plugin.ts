// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { physicsData } from "../../physics/physics-data-plugin.js";
import type { ColliderMesh } from "../../physics/body/collider-mesh.js";
import { modelLoader } from "../scene/model/model-loader-plugin.js";
import { hullVertices } from "../scene/model/shape/convex-hull.js";

/**
 * modelCollider — lets a rendered model double as a physics body whose collider is
 * **auto-generated from its mesh**. A `ModelBody` (or `StaticModelCollider`) carries
 * a `geometry` + a `colliderShape` of `"hull"` or `"mesh"` but *no* collision data;
 * this fills it once the mesh has loaded:
 *
 *   hull → `convexPoints` = the simplified hull vertices of the mesh (the engine
 *          rebuilds the hull) — a coarse, convex stand-in for a detailed model.
 *   mesh → `colliderMesh` = the mesh triangles verbatim (static trimesh).
 *
 * The source defaults to the body's own `geometry` but can be overridden with
 * `collisionGeometry` (point it at a low-poly mesh for a cheaper collider). The
 * model's `scale` is baked into the collision geometry so it matches the render.
 * Generated data is cached per (source geometry, shape, scale), so many instances
 * of one model share it. Authoring the collider by hand (supplying `convexPoints`
 * / `colliderMesh` directly, as `ConvexBody` / `MeshCollider` do) still works and
 * simply skips generation.
 *
 * Because the body already has a `geometry`, the physics render bridge leaves it
 * alone — it renders as the detailed model and collides as the generated shape.
 */
export const modelCollider = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, modelLoader),
    components: {
        collisionGeometry: Entity.schema, // optional override: generate the collider from this Geometry instead of `geometry`
    },
    archetypes: {
        // A model that is also a dynamic/kinematic body; collider auto-generated.
        ModelBody: ["geometry", "scale", "visible", "parent", "bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"],
        // A static model collider (immovable level geometry that renders as a model).
        StaticModelCollider: ["geometry", "scale", "visible", "parent", "colliderShape", "halfExtents", "material", "position", "rotation"],
    },
    systems: {
        generateModelColliders: {
            schedule: { during: ["postUpdate"] },
            create: db => {
                // generated collider data, shared across instances of the same (source mesh, shape, scale)
                const cache = new Map<string, { convexPoints: Float32Array } | { colliderMesh: ColliderMesh }>();
                return () => {
                    // model-bodies (geometry + scale) whose collider data isn't generated yet
                    for (const arch of db.store.queryArchetypes(["colliderShape", "geometry", "scale"], { exclude: ["convexPoints", "colliderMesh"] })) {
                        const ids = arch.columns.id, css = arch.columns.colliderShape, scl = arch.columns.scale;
                        // tail→head: filling the data migrates the row out of this archetype
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const shape = css.get(i);
                            if (shape !== "hull" && shape !== "mesh") continue; // primitive-shaped model-bodies need no generation
                            const id = ids.get(i);
                            const src = (db.store.read(id) as { collisionGeometry?: Entity }).collisionGeometry || arch.columns.geometry.get(i);
                            const mesh = db.store.read(src) as { _cpuPositions?: Float32Array | null; _cpuIndices?: Uint32Array | null } | null;
                            const positions = mesh?._cpuPositions;
                            if (!positions) continue; // source mesh not loaded yet — retry next frame
                            const s = scl.get(i), key = `${src}:${shape}:${s[0]}:${s[1]}:${s[2]}`;
                            let data = cache.get(key);
                            if (!data) {
                                const scaled = new Float32Array(positions.length);
                                for (let k = 0; k < positions.length; k += 3) { scaled[k] = positions[k] * s[0]; scaled[k + 1] = positions[k + 1] * s[1]; scaled[k + 2] = positions[k + 2] * s[2]; }
                                data = shape === "hull"
                                    ? { convexPoints: hullVertices(scaled) }
                                    : { colliderMesh: { positions: scaled, indices: mesh!._cpuIndices ?? new Uint32Array(0) } };
                                cache.set(key, data);
                            }
                            db.store.update(id, data);
                        }
                    }
                };
            },
        },
    },
});
