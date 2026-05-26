// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb } from "@adobe/data/math";
import { pbrCore } from "../pbr/pbr-core-plugin.js";
import { animation } from "../animation/animation-plugin.js";
import { graphics } from "../graphics-plugin.js";
import { model } from "./model-plugin.js";
import { loadGltfPrimitives, type GpuPrimitiveData } from "./gltf/load-gltf-model.js";
import type { LoadedAnimation } from "./gltf/parse-animations.js";
import type { JointTemplate } from "./gltf/parse-skin.js";

export interface LoadedArgs {
    geometry: number;
    bounds: Aabb;
    primitives: GpuPrimitiveData[];
    skinJointTemplate: JointTemplate[];
    skinInverseBindMatrices: Float32Array | null;
    animations: LoadedAnimation[];
}

/**
 * modelLoader
 *   query: Geometry-_bounds
 *   read:
 *     modelUrl
 *   write:
 *     _bounds: Aabb
 *     _skinJointTemplate: JointTemplate[]
 *     _skinInverseBindMatrices: Float32Array | null
 *     _animationClipRefs: EntityId[]
 *     _VisibleMaterial
 *     _PbrPrimitive
 *     AnimationClip                       // when the glTF carries animations
 */
export const modelLoader = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, model, graphics, animation),
    components: {
        _bounds: { default: null as unknown as Aabb },
        _skinJointTemplate: { default: [] as JointTemplate[] },
        _skinInverseBindMatrices: { default: null as Float32Array | null },
        _animationClipRefs: { default: [] as number[] },
    },
    transactions: {
        insertLoadedPrimitives(t, args: LoadedArgs) {
            for (const p of args.primitives) {
                const materialId = t.archetypes._VisibleMaterial.insert({
                    ephemeral: true,
                    _materialBindGroup: p.pbrMaterialBindGroup,
                    _geometry: args.geometry,
                });
                t.archetypes._PbrPrimitive.insert({
                    ephemeral: true,
                    _geometry: args.geometry,
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
            t.update(args.geometry, {
                _bounds: args.bounds,
                _skinJointTemplate: args.skinJointTemplate,
                _skinInverseBindMatrices: args.skinInverseBindMatrices,
                _animationClipRefs: clipRefs,
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
                    for (const arch of db.store.queryArchetypes(["modelUrl"])) {
                        const ids = arch.columns.id;
                        const urls = arch.columns.modelUrl;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i);
                            if (inFlight.has(id)) continue;
                            inFlight.add(id);
                            loadGltfPrimitives(device, urls.get(i))
                                .then(loaded => {
                                    db.transactions.insertLoadedPrimitives({
                                        geometry: id,
                                        bounds: loaded.bounds,
                                        primitives: loaded.primitives,
                                        skinJointTemplate: loaded.skin?.jointTemplate ?? [],
                                        skinInverseBindMatrices: loaded.skin?.inverseBindMatrices ?? null,
                                        animations: loaded.animations,
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
