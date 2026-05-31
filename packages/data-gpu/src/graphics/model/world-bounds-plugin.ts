// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Aabb, Mat4x4, type Vec3 } from "@adobe/data/math";
import { transform } from "../node/transform-plugin.js";
import { modelLoader } from "./model-loader-plugin.js";

/**
 * worldBoundsCreate
 *   query: Model-_worldBounds
 *   write: _worldBounds   (archetype migration; unit placeholder)
 *
 *   Adds the `_worldBounds` column to any Model that doesn't have it yet, so
 *   `worldBoundsSystem` can write directly without further migration.
 *
 * worldBoundsSystem
 *   query: Model+_worldMatrix+_worldBounds
 *   read:  geometry → _bounds, _worldMatrix
 *   write: _worldBounds
 *
 *   Transforms the asset-space AABB on each Model's `geometry` by the Model's
 *   `_worldMatrix` (all 8 corners, reduce to min/max) and writes the result.
 *   Geometries still loading have no `_bounds` yet — those Models are skipped
 *   until the asset finishes; their `_worldBounds` stays at its placeholder.
 *
 *   Cost: one matrix-vec multiply × 8 corners × N visible Models, per frame.
 *   At N=1000 that's ~8K vec3 ops; well under 0.1ms on modern CPUs.
 */
export const worldBounds = Database.Plugin.create({
    extends: Database.Plugin.combine(modelLoader, transform),
    systems: {
        worldBoundsCreate: {
            schedule: { after: ["transformCreateWorldMatrix"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(
                    ["geometry", "_worldMatrix"],
                    { exclude: ["_worldBounds"] },
                )) {
                    const ids = arch.columns.id;
                    // Iterate tail→head: every row migrates out of this archetype.
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        db.store.update(ids.get(i), { _worldBounds: Aabb.unit });
                    }
                }
            },
        },
        worldBoundsSystem: {
            schedule: { after: ["transformSystem", "worldBoundsCreate"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes([
                    "geometry", "_worldMatrix", "_worldBounds",
                ])) {
                    const geos = arch.columns.geometry;
                    const worldMats = arch.columns._worldMatrix;
                    const worldBoundsCol = arch.columns._worldBounds;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const localBounds = db.store.get(geos.get(i), "_bounds");
                        if (!localBounds) continue;
                        worldBoundsCol.set(i, transformAabb(localBounds, worldMats.get(i)));
                    }
                }
            },
        },
    },
});

const transformAabb = (local: Aabb, m: Mat4x4): Aabb => {
    const { min, max } = local;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    // The 8 box corners.
    for (let cx = 0; cx < 2; cx++) {
        for (let cy = 0; cy < 2; cy++) {
            for (let cz = 0; cz < 2; cz++) {
                const corner: Vec3 = [
                    cx === 0 ? min[0] : max[0],
                    cy === 0 ? min[1] : max[1],
                    cz === 0 ? min[2] : max[2],
                ];
                const w = Mat4x4.multiplyVec3(m, corner);
                if (w[0] < minX) minX = w[0]; if (w[0] > maxX) maxX = w[0];
                if (w[1] < minY) minY = w[1]; if (w[1] > maxY) maxY = w[1];
                if (w[2] < minZ) minZ = w[2]; if (w[2] > maxZ) maxZ = w[2];
            }
        }
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
};
