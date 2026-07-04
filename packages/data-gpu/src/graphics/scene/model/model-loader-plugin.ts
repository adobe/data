// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb } from "@adobe/data/math";
import { pbrCore } from "../../rendering/pbr-core-plugin.js";
import { animation } from "../../animation/animation-plugin.js";
import { core } from "../../../core/core-plugin.js";
import { mesh } from "./mesh-plugin.js";
import { loadGltfPrimitives, type GpuPrimitiveData } from "./gltf/load-gltf-model.js";
import type { LoadedAnimation } from "./gltf/parse-animations.js";
import type { JointTemplate } from "./gltf/parse-skin.js";

export interface LoadedArgs {
    mesh: number;
    bounds: Aabb;
    primitives: GpuPrimitiveData[];
    skinJointTemplate: JointTemplate[];
    skinInverseBindMatrices: Float32Array | null;
    animations: LoadedAnimation[];
    collision: { positions: Float32Array; indices: Uint32Array } | null;
    skinVertices: { positions: Float32Array; joints: Uint32Array; weights: Float32Array } | null;
}

/**
 * modelLoader — queries `GltfMeshPending`, fetches each `gltfUrl`, inserts
 * `_PbrPrimitive` rows, and migrates the mesh entity to `StaticMesh` or
 * `SkinnedMesh` with capability components.
 */
export const modelLoader = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, mesh, core, animation),
    transactions: {
        insertLoadedPrimitives(t, args: LoadedArgs) {
            for (const p of args.primitives) {
                const materialId = t.archetypes._VisibleMaterial.insert({
                    nonPersistent: true,
                    _materialBindGroup: p.pbrMaterialBindGroup,
                    _mesh: args.mesh,
                });
                t.archetypes._PbrPrimitive.insert({
                    nonPersistent: true,
                    _mesh: args.mesh,
                    _material: materialId,
                    _vertexBuffer: p.pbrVertexBuffer,
                    _skinVertexBuffer: p.pbrSkinVertexBuffer,
                    _indexBuffer: p.pbrIndexBuffer,
                    _indexCount: p.pbrIndexCount,
                    _indexFormat: p.pbrIndexFormat,
                    _nodeLocalMatrix: p.pbrNodeLocalMatrix,
                });
            }
            const clipRefs: number[] = [];
            for (const anim of args.animations) {
                if (anim.tracks.length === 0) continue;
                const clipId = t.archetypes.AnimationClip.insert({
                    animationClipTracks: anim.tracks,
                    animationClipDuration: anim.duration,
                });
                clipRefs.push(clipId);
            }
            const skinned = args.skinJointTemplate.length > 0;
            t.update(args.mesh, {
                localBounds: args.bounds,
                cpuCollisionPositions: args.collision?.positions ?? null,
                cpuCollisionIndices: args.collision?.indices ?? null,
                cpuSkin: args.skinVertices,
                ...(skinned ? {
                    skinJointTemplate: args.skinJointTemplate,
                    skinInverseBindMatrices: args.skinInverseBindMatrices,
                    animationClipRefs: clipRefs,
                } : {}),
            });
        },
    },
    systems: {
        modelLoadSystem: {
            create: db => {
                const inFlight = new Set<number>();
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    for (const arch of db.store.queryArchetypes(["gltfUrl"])) {
                        const ids = arch.columns.id;
                        const urls = arch.columns.gltfUrl;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i);
                            if (inFlight.has(id)) continue;
                            const url = urls.get(i);
                            if (!url) continue;
                            inFlight.add(id);
                            loadGltfPrimitives(device, url)
                                .then(loaded => {
                                    db.transactions.insertLoadedPrimitives({
                                        mesh: id,
                                        bounds: loaded.bounds,
                                        primitives: loaded.primitives,
                                        skinJointTemplate: loaded.skin?.jointTemplate ?? [],
                                        skinInverseBindMatrices: loaded.skin?.inverseBindMatrices ?? null,
                                        animations: loaded.animations,
                                        collision: loaded.collision,
                                        skinVertices: loaded.skinVertices,
                                    });
                                })
                                .catch(err => {
                                    console.error("[modelLoader] Failed to load model", urls.get(i), err);
                                });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
