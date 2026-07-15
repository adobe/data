// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Aabb, Mat4x4, type Vec3 } from "@adobe/data/math";
import { transform } from "../node/transform-plugin.js";
import { modelLoader } from "./model-loader-plugin.js";

/**
 * worldBounds — derives `_worldBounds` on `Model` rows from each instance's
 * mesh `localBounds` and `_worldMatrix`.
 */
export const worldBounds = Database.Plugin.create({
    extends: Database.Plugin.combine(modelLoader, transform),
    systems: {
        worldBoundsCreate: {
            schedule: { after: ["transformCreateWorldMatrix"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(
                    ["mesh", "_worldMatrix"],
                    { exclude: ["_worldBounds"] },
                )) {
                    const ids = arch.columns.id;
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
                    "mesh", "_worldMatrix", "_worldBounds",
                ])) {
                    const meshRefs = arch.columns.mesh;
                    const worldMats = arch.columns._worldMatrix;
                    const worldBoundsCol = arch.columns._worldBounds;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const localBounds = db.store.get(meshRefs.get(i), "localBounds") as Aabb | null;
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
