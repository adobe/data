// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { physicsData, RIGID_BODY_COMPONENTS, STATIC_COLLIDER_COMPONENTS } from "../physics/physics-data-plugin.js";
import { mesh } from "../graphics/scene/model/mesh-plugin.js";
import { shapeGeometry } from "../graphics/scene/model/shape/shape-geometry-plugin.js";
import { physicsRenderBridge } from "../graphics/rendering/pbr-render/physics-bridge-plugin.js";
import type { ShapeSpec } from "../graphics/scene/model/shape/shape-spec.js";
import { definitions, type VoxelShapeName } from "./voxel-shape-definitions.js";
import { volumeContentKey } from "./volume-content-key.js";

const insertVoxelShapeMesh = (
    t: {
        resources: {
            _voxelMeshByKey: Map<string, Entity> | null;
            _voxelVolumeByMesh: Map<Entity, DenseVolume<boolean>> | null;
        };
        archetypes: {
            ShapeMeshPending: {
                insert: (row: { shapeSpec: ShapeSpec; voxelVolumeSize: Vec3 }) => Entity;
            };
        };
    },
    args: { volume: DenseVolume<boolean> },
): Entity => {
    const key = volumeContentKey(args.volume);
    const byKey = t.resources._voxelMeshByKey ??= new Map();
    const existing = byKey.get(key);
    if (existing != null) return existing;

    const id = t.archetypes.ShapeMeshPending.insert({
        shapeSpec: { kind: "voxelShape" },
        voxelVolumeSize: [...args.volume.size] as Vec3,
    });
    (t.resources._voxelVolumeByMesh ??= new Map()).set(id, args.volume);
    byKey.set(key, id);
    return id;
};

/**
 * voxelShape — registers authored boolean volumes, deduplicates mesh baking by
 * volume content, and attaches baked mesh refs to bodies that reference them.
 * Physics colliders stay unchanged; only the visual mesh is overridden.
 */
export const voxelShape = Database.Plugin.create({
    extends: Database.Plugin.combine(mesh, shapeGeometry, physicsData),
    components: {
        /** Body → baked (or pending) voxel mesh entity. Visual only. */
        voxelShape: Entity.schema,
    },
    resources: {
        _voxelMeshByKey: { default: null as Map<string, Entity> | null, transient: true },
        _voxelShapeByName: { default: null as Map<VoxelShapeName, Entity> | null, transient: true },
    },
    archetypes: {
        /** Same as RigidBody but visual mesh comes from `voxelShape`, not the collider primitive. */
        VoxelRigidBody: [...RIGID_BODY_COMPONENTS, "voxelShape"],
        /** Same as StaticCollider but visual mesh comes from `voxelShape`, not the collider primitive. */
        VoxelStaticCollider: [...STATIC_COLLIDER_COMPONENTS, "voxelShape"],
    },
    transactions: {
        insertVoxelShapeMesh(t, args: { volume: DenseVolume<boolean> }): Entity {
            return insertVoxelShapeMesh(t, args);
        },
        seedVoxelShapeDefinitions(t) {
            const byName = t.resources._voxelShapeByName ??= new Map();
            for (const name of Object.keys(definitions) as VoxelShapeName[]) {
                byName.set(name, insertVoxelShapeMesh(t, { volume: definitions[name]() }));
            }
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
                        const he = halfExtents.get(i);
                        const localBounds = db.store.get(meshId, "localBounds");
                        const volumeSize = db.store.get(meshId, "voxelVolumeSize");
                        // Wait until shapeMeshBake has produced a StaticMesh + _PbrPrimitive.
                        if (volumeSize == null || localBounds == null) continue;

                        const scale: Vec3 = [
                            (2 * he[0]) / volumeSize[0],
                            (2 * he[1]) / volumeSize[1],
                            (2 * he[2]) / volumeSize[2],
                        ];
                        db.store.update(id, { mesh: meshId, scale, visible: true });
                    }
                }
            },
        },
    },
});

/** Convenience bundle: voxel visuals + default collider primitive bridge for other physics archetypes. */
export const voxelShapeRender = Database.Plugin.combine(
    voxelShape,
    voxelShapeVisualBridge,
    physicsRenderBridge,
);
