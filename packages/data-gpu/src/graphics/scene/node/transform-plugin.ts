// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4, Quat } from "@adobe/data/math";
import { nodeData } from "./node-data-plugin.js";

/**
 * transformCreateWorldMatrix
 *   query: Node-_worldMatrix
 *   write: _worldMatrix   (archetype migration; identity)
 *
 *   Adds the `_worldMatrix` column to any Node that doesn't have it yet, so
 *   `transformSystem` can assume the column exists and write to it directly.
 *
 * transformSystem
 *   query: Node+_worldMatrix
 *   read:  position, rotation, scale, parent
 *   write: _worldMatrix
 *
 *   Computes TRS for every Node and writes the result into the existing
 *   `_worldMatrix` column. Parents are typically inserted before children
 *   (glTF order, sample setup), so by the time we reach a child the parent's
 *   matrix is already populated this frame.
 */
export const transform = Database.Plugin.create({
    extends: nodeData,
    systems: {
        transformCreateWorldMatrix: {
            create: db => () => {
                for (const arch of db.store.queryArchetypes(
                    ["position", "rotation", "scale", "parent"],
                    { exclude: ["_worldMatrix"] },
                )) {
                    const ids = arch.columns.id;
                    // Iterate tail→head: every row migrates out of this archetype,
                    // and removing the last row first means no hole-fill shift.
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        db.store.update(ids.get(i), { _worldMatrix: Mat4x4.identity });
                    }
                }
            },
        },
        transformSystem: {
            schedule: { after: ["transformCreateWorldMatrix"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes([
                    "position", "rotation", "scale", "parent", "_worldMatrix",
                ])) {
                    const positions = arch.columns.position;
                    const rotations = arch.columns.rotation;
                    const scales = arch.columns.scale;
                    const parents = arch.columns.parent;
                    const worldMats = arch.columns._worldMatrix;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const pos = positions.get(i);
                        const rot = rotations.get(i);
                        const scl = scales.get(i);
                        const parentId = parents.get(i);
                        const local = Mat4x4.multiply(
                            Mat4x4.translation(pos[0], pos[1], pos[2]),
                            Mat4x4.multiply(Quat.toMat4(rot), Mat4x4.scaling(scl[0], scl[1], scl[2])),
                        );
                        const parentWorld = parentId === 0
                            ? Mat4x4.identity
                            : db.store.get(parentId, "_worldMatrix") ?? Mat4x4.identity;
                        worldMats.set(i, parentId === 0 ? local : Mat4x4.multiply(parentWorld, local));
                    }
                }
            },
        },
    },
});
