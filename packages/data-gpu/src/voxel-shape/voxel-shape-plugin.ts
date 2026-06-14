// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { physicsData, RIGID_BODY_COMPONENTS, STATIC_COLLIDER_COMPONENTS } from "../physics/physics-data-plugin.js";
import { core } from "../core/core-plugin.js";
import { mesh } from "../graphics/scene/model/mesh-plugin.js";
import { shapeGeometry } from "../graphics/scene/model/shape/shape-geometry-plugin.js";
import { booleanVolumeMesh } from "../graphics/scene/model/shape/boolean-volume-mesh.js";
import { uploadShapeMesh } from "../graphics/scene/model/shape/upload-shape-mesh.js";
import { boundsFromShapeMesh } from "../graphics/scene/model/shape/bounds-from-shape-mesh.js";
import { insertVoxelShapeMesh } from "./voxel-shape-insert.js";
import { voxelMeshScaleForGridSize, voxelMeshScaleToHalfExtents } from "./voxel-mesh-scale.js";

/**
 * voxelShape — boolean volume visuals referenced by name, loaded async via
 * `voxelShapeLoader`, baked to mesh entities, attached on `voxelShape`.
 */
export const voxelShape = Database.Plugin.create({
    imports: shapeGeometry,
    extends: Database.Plugin.combine(mesh, physicsData, core),
    components: {
        /** On-disk shape id (`<filename>.json` without extension). */
        voxelShapeName: { type: "string" },
        /** Body → baked (or pending) voxel mesh entity. Set after load. */
        voxelShape: Entity.schema,
    },
    resources: {
        _voxelMeshByKey: { default: null as Map<string, Entity> | null, transient: true },
        _voxelShapeByName: { default: null as Map<string, Entity> | null, transient: true },
        _voxelSizeByName: { default: null as Map<string, Vec3> | null, transient: true },
        _voxelVolumeByMesh: { default: null as Map<Entity, DenseVolume<boolean>> | null, transient: true },
    },
    archetypes: {
        VoxelRigidBody: [...RIGID_BODY_COMPONENTS, "voxelShapeName"],
        VoxelStaticCollider: [...STATIC_COLLIDER_COMPONENTS, "voxelShapeName"],
        /** Pending boolean volume → GPU mesh bake queue (owned by this plugin). */
        VoxelMeshPending: ["voxelVolumeSize"],
    },
    transactions: {
        insertVoxelShapeMesh(t, args: { volume: DenseVolume<boolean> }): Entity {
            return insertVoxelShapeMesh(t, args);
        },
    },
    systems: {
        voxelShapeBake: {
            schedule: { during: ["preUpdate"], after: ["shapeGeometryInit"] },
            create: db => () => {
                const { device } = db.store.resources;
                if (!device) return;

                for (const arch of db.store.queryArchetypes(["voxelVolumeSize"], { exclude: ["localBounds"] })) {
                    const ids = arch.columns.id;
                    const sizes = arch.columns.voxelVolumeSize;
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const meshId = ids.get(i);
                        const volume = db.store.resources._voxelVolumeByMesh?.get(meshId) ?? null;
                        if (volume == null) continue;

                        const data = booleanVolumeMesh(volume);
                        const gpu = uploadShapeMesh(device, data);
                        db.transactions.insertStaticMeshPrimitive({
                            mesh: meshId,
                            vertexBuffer: gpu.vb,
                            indexBuffer: gpu.ib,
                            indexCount: gpu.count,
                            localBounds: boundsFromShapeMesh(data),
                        });
                        db.store.update(meshId, {
                            voxelVolumeSize: [...sizes.get(i)!] as Vec3,
                        });
                        db.store.resources._voxelVolumeByMesh?.delete(meshId);
                    }
                }
            },
        },
    },
});

/** Assigns baked voxel mesh refs to voxel physics rows (not handled by `physicsBridge`). */
export const voxelShapeVisualBridge = Database.Plugin.create({
    extends: voxelShape,
    systems: {
        voxelShapeVisualBridge: {
            schedule: { during: ["postUpdate"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(
                    ["voxelShape", "halfExtents"],
                    { exclude: ["mesh"] },
                )) {
                    const ids = arch.columns.id;
                    const voxelShapes = arch.columns.voxelShape;
                    const halfExtents = arch.columns.halfExtents;
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const id = ids.get(i);
                        const meshId = voxelShapes.get(i);
                        const volumeSize = db.store.get(meshId, "voxelVolumeSize");
                        if (volumeSize == null) continue;

                        const he = halfExtents.get(i);
                        const scale = db.store.get(id, "bodyType") != null
                            ? voxelMeshScaleForGridSize(volumeSize)
                            : voxelMeshScaleToHalfExtents(volumeSize, he);
                        db.store.update(id, { mesh: meshId, scale, visible: true });
                    }
                }
            },
        },
    },
});
