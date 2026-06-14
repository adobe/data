// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { physicsData } from "../../physics/physics-data-plugin.js";
import type { ColliderMesh } from "../../physics/body/collider-mesh.js";
import { modelLoader } from "../scene/model/model-loader-plugin.js";
import { hullVertices } from "../scene/model/shape/convex-hull.js";

/**
 * modelCollider — auto-generates physics colliders from loaded mesh CPU data.
 */
export const modelCollider = Database.Plugin.create({
    extends: Database.Plugin.combine(physicsData, modelLoader),
    components: {
        collisionMesh: Entity.schema,
    },
    archetypes: {
        ModelBody: ["mesh", "scale", "visible", "parent", "bodyType", "colliderShape", "halfExtents", "material", "position", "rotation", "linearVelocity", "angularVelocity"],
        StaticModelCollider: ["mesh", "scale", "visible", "parent", "colliderShape", "halfExtents", "material", "position", "rotation"],
    },
    systems: {
        generateModelColliders: {
            schedule: { during: ["postUpdate"] },
            create: db => {
                const cache = new Map<string, { convexPoints: Float32Array } | { colliderMesh: ColliderMesh }>();
                return () => {
                    for (const arch of db.store.queryArchetypes(["colliderShape", "mesh", "scale"], { exclude: ["convexPoints", "colliderMesh"] })) {
                        const ids = arch.columns.id, css = arch.columns.colliderShape, scl = arch.columns.scale;
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const shape = css.get(i);
                            if (shape !== "hull" && shape !== "mesh") continue;
                            const id = ids.get(i);
                            const src = (db.store.read(id) as { collisionMesh?: Entity }).collisionMesh ?? arch.columns.mesh.get(i);
                            const asset = db.store.read(src) as {
                                cpuCollisionPositions?: Float32Array | null;
                                cpuCollisionIndices?: Uint32Array | null;
                            } | null;
                            const positions = asset?.cpuCollisionPositions;
                            if (!positions) continue;
                            const s = scl.get(i), key = `${src}:${shape}:${s[0]}:${s[1]}:${s[2]}`;
                            let data = cache.get(key);
                            if (!data) {
                                const scaled = new Float32Array(positions.length);
                                for (let k = 0; k < positions.length; k += 3) {
                                    scaled[k] = positions[k] * s[0];
                                    scaled[k + 1] = positions[k + 1] * s[1];
                                    scaled[k + 2] = positions[k + 2] * s[2];
                                }
                                data = shape === "hull"
                                    ? { convexPoints: hullVertices(scaled) }
                                    : { colliderMesh: { positions: scaled, indices: asset!.cpuCollisionIndices ?? new Uint32Array(0) } };
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
