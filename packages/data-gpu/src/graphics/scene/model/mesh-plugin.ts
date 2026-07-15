// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Aabb, Quat, type Vec3 } from "@adobe/data/math";
import { Node } from "../node/node.js";
import { plugin as Material } from "../../../material/material-plugin.js";
import type { ShapeSpec } from "./shape/shape-spec.js";
import type { JointTemplate } from "./gltf/parse-skin.js";

/**
 * Mesh asset model — separates mesh **intent** (pending import), **asset**
 * (static or skinned capabilities), and **instance** (placed drawables).
 *
 * - `GltfMeshPending` / `ShapeMeshPending` — work queue; the entity id is the
 *   stable mesh handle instances can reference before GPU data exists.
 * - `StaticMesh` / `SkinnedMesh` — baked assets with capability components.
 * - `Model` — hierarchical instance (glTF / scene graph).
 * - `MeshInstance` — render-only instance with a material (factor path).
 */
export const mesh = Database.Plugin.create({
    extends: Database.Plugin.combine(Node.plugin, Material),
    components: {
        /** Instance → baked mesh asset entity. */
        mesh: Entity.schema,
        /** Pending glTF import — cleared when the row migrates to Static/SkinnedMesh. */
        gltfUrl: { type: "string" },
        /** Pending procedural import — cleared when baked to StaticMesh. */
        shapeSpec: { default: null as ShapeSpec | null },
        /** Optional grid dimensions on baked mesh assets (used by extensions for scale). */
        voxelVolumeSize: { default: null as Vec3 | null },
        /** Asset-space axis-aligned bounds (all baked meshes). */
        localBounds: { default: null as Aabb | null },
        /** Skinned-mesh capabilities (SkinnedMesh archetype). */
        skinJointTemplate: { default: [] as JointTemplate[] },
        skinInverseBindMatrices: { default: null as Float32Array | null },
        animationClipRefs: { default: [] as number[] },
        /** CPU-retained collision source for auto-collider generation. */
        cpuCollisionPositions: { default: null as Float32Array | null },
        cpuCollisionIndices: { default: null as Uint32Array | null },
        /** CPU-retained skin bind data for ragdoll capsule fitting. */
        cpuSkin: { default: null as { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null },
    },
    resources: {
        _gltfMeshByUrl: { default: null as Map<string, Entity> | null, nonPersistent: true },
    },
    archetypes: {
        GltfMeshPending:  ["gltfUrl"],
        ShapeMeshPending: ["shapeSpec"],
        StaticMesh:       ["localBounds"],
        SkinnedMesh:      ["localBounds", "skinJointTemplate", "skinInverseBindMatrices", "animationClipRefs"],
        MeshInstance:     ["mesh", "position", "rotation", "scale", "visible", "material"],
        Model:            ["mesh", "position", "rotation", "scale", "visible", "parent"],
    },
    transactions: {
        insertGltfMesh(t, args: { url: string }): Entity {
            const map = t.resources._gltfMeshByUrl ??= new Map();
            const existing = map.get(args.url);
            if (existing != null) return existing;
            const id = t.archetypes.GltfMeshPending.insert({ gltfUrl: args.url });
            map.set(args.url, id);
            return id;
        },
        insertShapeMesh(t, args: { shapeSpec: ShapeSpec }): Entity {
            return t.archetypes.ShapeMeshPending.insert({ shapeSpec: args.shapeSpec });
        },
        insertMeshInstance(t, args: {
            mesh: Entity;
            material: Entity;
            position?: Vec3;
            rotation?: Quat;
            scale?: Vec3;
        }): Entity {
            return t.archetypes.MeshInstance.insert({
                mesh:     args.mesh,
                material: args.material,
                position: args.position ?? [0, 0, 0],
                rotation: args.rotation ?? Quat.identity,
                scale:    args.scale    ?? [1, 1, 1],
                visible:  true,
            });
        },
        insertModel(t, args: {
            mesh: Entity;
            position?: Vec3;
            rotation?: Quat;
            scale?: Vec3;
            parent?: Entity;
        }): Entity {
            return t.archetypes.Model.insert({
                mesh:     args.mesh,
                position: args.position ?? [0, 0, 0],
                rotation: args.rotation ?? Quat.identity,
                scale:    args.scale    ?? [1, 1, 1],
                visible:  true,
                parent:   args.parent   ?? 0,
            });
        },
    },
});

/** @deprecated Use `mesh` — kept for scene combiner import path. */
export const model = mesh;
