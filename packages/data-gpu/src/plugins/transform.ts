// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4, Quat, Vec3 } from "@adobe/data/math";
import { node } from "./node.js";

export const transform = Database.Plugin.create({
    extends: node,
    resources: {
        worldMatrices: { default: new Map() as Map<number, Mat4x4>, transient: true },
    },
    systems: {
        transformSystem: {
            create: db => () => {
                const map = db.store.resources.worldMatrices;
                map.clear();
                for (const arch of db.store.queryArchetypes(["position", "rotation", "scale", "parent"])) {
                    const ids = arch.columns.id;
                    const positions = arch.columns.position;
                    const rotations = arch.columns.rotation;
                    const scales = arch.columns.scale;
                    const parents = arch.columns.parent;
                    for (let i = 0; i < arch.rowCount; i++) {
                        const id = ids.get(i) as number;
                        const pos = positions.get(i) as Vec3;
                        const rot = rotations.get(i) as Quat;
                        const scl = scales.get(i) as Vec3;
                        const parentId = parents.get(i) as number;
                        const localTRS = Mat4x4.multiply(
                            Mat4x4.translation(pos[0], pos[1], pos[2]),
                            Mat4x4.multiply(Quat.toMat4(rot), Mat4x4.scaling(scl[0], scl[1], scl[2])),
                        );
                        if (parentId === 0) {
                            map.set(id, localTRS);
                        } else {
                            const parentWorld = map.get(parentId) ?? Mat4x4.identity;
                            map.set(id, Mat4x4.multiply(parentWorld, localTRS));
                        }
                    }
                }
            },
        },
    },
});
