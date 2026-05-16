// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb, Quat, Vec3 } from "@adobe/data/math";
import { animation } from "../animation/animation.js";
import { graphics } from "../graphics.js";
import { node } from "../node.js";
import { loadGltfPrimitives, type GpuPrimitiveData } from "./gltf/load-gltf-model.js";
import type { LoadedAnimation } from "./gltf/parse-animations.js";
import type { JointTemplate } from "./gltf/parse-skin.js";
import { pbrCore } from "../pbr-core.js";

export interface LoadedArgs {
    pbrGeometryRef: number;
    bounds: Aabb;
    primitives: GpuPrimitiveData[];
    skinJointTemplate: JointTemplate[];
    skinInverseBindMatrices: Float32Array | null;
    animations: LoadedAnimation[];
}

export const pbrModelLoader = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, node, graphics, animation),
    components: {
        pbrModelUrl: { default: "" as string },
        pbrModelBounds: { default: null as unknown as Aabb },
        /** Per-joint local TRS + parent-index. Empty for non-skinned models;
         *  the skinning init system uses this to instantiate joint entities. */
        skinJointTemplate: { default: [] as JointTemplate[] },
        /** N × 16 flat floats. Null when the glTF has no skin. */
        skinInverseBindMatrices: { default: null as Float32Array | null },
        /** Entity ids of AnimationClip entities bundled with this asset. */
        animationClipRefs: { default: [] as number[] },
    },
    archetypes: {
        Geometry: ["pbrModelUrl"],
        Model: ["pbrGeometryRef", "position", "rotation", "scale", "visible", "parent", "animationSkeletonRef"],
    },
    transactions: {
        insertGeometry(t, args: { pbrModelUrl: string }): number {
            return t.archetypes.Geometry.insert({ pbrModelUrl: args.pbrModelUrl });
        },
        insertModel(t, args: { pbrGeometryRef: number; position?: Vec3; rotation?: Quat; scale?: Vec3; parent?: number }): number {
            return t.archetypes.Model.insert({
                pbrGeometryRef: args.pbrGeometryRef,
                position: args.position ?? [0, 0, 0],
                rotation: args.rotation ?? [0, 0, 0, 1],
                scale: args.scale ?? [1, 1, 1],
                visible: true,
                parent: args.parent ?? 0,
                animationSkeletonRef: 0,
            });
        },
        pbrInsertLoadedPrimitives(t, args: LoadedArgs) {
            for (const p of args.primitives) {
                const materialId = t.archetypes.PbrMaterial.insert({
                    ephemeral: true,
                    pbrMaterialBindGroup: p.pbrMaterialBindGroup,
                    pbrGeometryRef: args.pbrGeometryRef,
                });
                t.archetypes.PbrPrimitive.insert({
                    ephemeral: true,
                    pbrGeometryRef: args.pbrGeometryRef,
                    pbrMaterialRef: materialId,
                    pbrVertexBuffer: p.pbrVertexBuffer,
                    pbrSkinVertexBuffer: p.pbrSkinVertexBuffer,
                    pbrIndexBuffer: p.pbrIndexBuffer,
                    pbrIndexCount: p.pbrIndexCount,
                    pbrIndexFormat: p.pbrIndexFormat,
                    pbrNodeLocalMatrix: p.pbrNodeLocalMatrix,
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
            t.update(args.pbrGeometryRef, {
                pbrModelBounds: args.bounds,
                skinJointTemplate: args.skinJointTemplate,
                skinInverseBindMatrices: args.skinInverseBindMatrices,
                animationClipRefs: clipRefs,
            });
        },
    },
    systems: {
        pbrModelLoadSystem: {
            create: db => {
                const inFlight = new Set<number>();
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    for (const arch of db.store.queryArchetypes(["pbrModelUrl"])) {
                        const ids = arch.columns.id;
                        const urls = arch.columns.pbrModelUrl;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const id = ids.get(i) as number;
                            if (inFlight.has(id)) continue;
                            inFlight.add(id);
                            loadGltfPrimitives(device, urls.get(i) as string)
                                .then(loaded => {
                                    db.transactions.pbrInsertLoadedPrimitives({
                                        pbrGeometryRef: id,
                                        bounds: loaded.bounds,
                                        primitives: loaded.primitives,
                                        skinJointTemplate: loaded.skin?.jointTemplate ?? [],
                                        skinInverseBindMatrices: loaded.skin?.inverseBindMatrices ?? null,
                                        animations: loaded.animations,
                                    });
                                })
                                .catch(err => {
                                    console.error("[pbrModelLoader] Failed to load model", urls.get(i), err);
                                });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
