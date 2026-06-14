// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { physicsData } from "../physics/physics-data-plugin.js";
import { mesh } from "../graphics/scene/model/mesh-plugin.js";
import { shapeGeometry } from "../graphics/scene/model/shape/shape-geometry-plugin.js";
import { physicsRenderBridge } from "../graphics/rendering/pbr-render/physics-bridge-plugin.js";
import type { ShapeSpec } from "../graphics/scene/model/shape/shape-spec.js";
import { definitions } from "./voxel-shape-definitions.js";
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
const RIGID_BODY_COMPONENTS = [
    "bodyType",
    "colliderShape",
    "halfExtents",
    "material",
    "position",
    "rotation",
    "linearVelocity",
    "angularVelocity",
] as const;

export const voxelShape = Database.Plugin.create({
    extends: Database.Plugin.combine(mesh, shapeGeometry, physicsData),
    components: {
        /** Body → baked (or pending) voxel mesh entity. Visual only. */
        voxelShape: Entity.schema,
    },
    resources: {
        _voxelMeshByKey: { default: null as Map<string, Entity> | null, transient: true },
        _voxelShapeByName: { default: null as Map<string, Entity> | null, transient: true },
    },
    archetypes: {
        /** Same as RigidBody but carries a voxelShape mesh ref at insert time. */
        VoxelRigidBody: [...RIGID_BODY_COMPONENTS, "voxelShape"],
    },
    transactions: {
        insertVoxelShapeMesh(t, args: { volume: DenseVolume<boolean> }): Entity {
            return insertVoxelShapeMesh(t, args);
        },
        seedVoxelShapeDefinitions(t) {
            const byName = t.resources._voxelShapeByName ??= new Map();
            for (const [name, factory] of Object.entries(definitions)) {
                byName.set(name, insertVoxelShapeMesh(t, { volume: factory() }));
            }
        },
    },
});

/** Attaches voxel mesh refs to physics bodies after the default cube bridge runs. */
export const voxelShapeVisualBridge = Database.Plugin.create({
    extends: Database.Plugin.combine(voxelShape, physicsRenderBridge),
    systems: {
        voxelShapeVisualBridge: {
            schedule: { during: ["postUpdate"], after: ["physicsBridge"] },
            create: db => () => {
                for (const arch of db.store.queryArchetypes(["voxelShape", "halfExtents"])) {
                    const ids = arch.columns.id;
                    const voxelShapes = arch.columns.voxelShape;
                    const halfExtents = arch.columns.halfExtents;
                    for (let i = arch.rowCount - 1; i >= 0; i--) {
                        const id = ids.get(i);
                        const meshId = voxelShapes.get(i);
                        const he = halfExtents.get(i);
                        const meshRow = db.store.read(meshId) as {
                            voxelVolumeSize?: Vec3 | null;
                            localBounds?: unknown;
                        };
                        const volumeSize = meshRow.voxelVolumeSize;
                        // Wait until shapeMeshBake has produced a StaticMesh + _PbrPrimitive.
                        if (volumeSize == null || meshRow.localBounds == null) continue;

                        const scale: Vec3 = [
                            (2 * he[0]) / volumeSize[0],
                            (2 * he[1]) / volumeSize[1],
                            (2 * he[2]) / volumeSize[2],
                        ];
                        const current = db.store.read(id) as { mesh?: Entity; scale?: Vec3 };
                        if (current.mesh === meshId && current.scale?.[0] === scale[0]) continue;
                        db.store.update(id, { mesh: meshId, scale, visible: true });
                    }
                }
            },
        },
    },
});

/** Combined plugin for samples: voxel visuals + physics cube bridge. */
export const voxelShapeRender = Database.Plugin.combine(voxelShape, voxelShapeVisualBridge);
