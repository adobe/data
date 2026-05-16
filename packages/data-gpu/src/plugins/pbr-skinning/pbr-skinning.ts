// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { animation } from "../animation/animation.js";
import { pbrModelLoader } from "../pbr-model-loader/pbr-model-loader.js";
import type { JointTemplate } from "../pbr-model-loader/gltf/parse-skin.js";
import { transform } from "../transform.js";

/**
 * GPU-side skeletal skinning. Watches for `Model` entities whose `Geometry`
 * provides a `skinJointTemplate` and instantiates per-instance:
 *
 *   - one joint entity per template entry (TRS from `node` plugin)
 *   - a `Skeleton` entity tracking the joint ids, geometry ref, and a per-frame
 *     joint-matrix GPU storage buffer
 *   - if the geometry came with `animationClipRefs`, an `AnimationPlayer`
 *     whose `animationTargets` are the joint ids (so clip tracks resolve)
 *
 * Each frame, `pbrSkinningMatrixSystem` reads joint world matrices computed
 * by the transform system, factors out the Model's world matrix (so the
 * vertex shader can apply it separately), multiplies by the bind-pose inverse,
 * and writes the resulting N × Mat4x4 storage buffer used by the skinned PBR
 * vertex shader.
 */
export const pbrSkinning = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrModelLoader, animation, transform),
    components: {
        skeletonJoints: { default: [] as number[] },
        skeletonGeometryRef: { default: 0 as number },
        /** 64 bytes — the Model's world matrix, refreshed each frame. */
        skeletonInstanceBuffer: { default: null as GPUBuffer | null },
        /** N × 64 bytes — joint skinning matrices, refreshed each frame. */
        skeletonJointMatrixBuffer: { default: null as GPUBuffer | null },
    },
    archetypes: {
        Skeleton: [
            "skeletonJoints",
            "skeletonGeometryRef",
            "skeletonModelRef",
            "skeletonInstanceBuffer",
            "skeletonJointMatrixBuffer",
            "skeletonJointMatrixBindGroup",
        ],
    },
    transactions: {
        pbrInitSkeleton(t, args: {
            modelRef: number;
            geometryRef: number;
            jointTemplate: JointTemplate[];
            instanceBuffer: GPUBuffer;
            jointMatrixBuffer: GPUBuffer;
            jointMatrixBindGroup: GPUBindGroup;
            clipRef: number | null;
        }) {
            const jointIds: number[] = new Array(args.jointTemplate.length);
            // jointTemplate is in glTF skin.joints[] order. Parents can come
            // after children in glTF, so resolve parent entity ids in two passes:
            // first insert with parent=0, then update each joint's parent.
            for (let i = 0; i < args.jointTemplate.length; i++) {
                const j = args.jointTemplate[i];
                jointIds[i] = t.archetypes.Node.insert({
                    position: j.position,
                    rotation: j.rotation,
                    scale: j.scale,
                    visible: true,
                    parent: 0,
                });
            }
            for (let i = 0; i < args.jointTemplate.length; i++) {
                const parentJoint = args.jointTemplate[i].parentJointIndex;
                const parentId = parentJoint >= 0 ? jointIds[parentJoint] : args.modelRef;
                t.update(jointIds[i], { parent: parentId });
            }
            const skeletonId = t.archetypes.Skeleton.insert({
                skeletonJoints: jointIds,
                skeletonGeometryRef: args.geometryRef,
                skeletonModelRef: args.modelRef,
                skeletonInstanceBuffer: args.instanceBuffer,
                skeletonJointMatrixBuffer: args.jointMatrixBuffer,
                skeletonJointMatrixBindGroup: args.jointMatrixBindGroup,
            });
            t.update(args.modelRef, { animationSkeletonRef: skeletonId });
            if (args.clipRef !== null) {
                t.archetypes.AnimationPlayer.insert({
                    animationClipRef: args.clipRef,
                    animationTargets: jointIds,
                    animationTime: 0,
                    animationSpeed: 1,
                    animationLoop: true,
                    animationPlaying: true,
                });
            }
        },
    },
    systems: {
        pbrSkinningInitSystem: {
            create: db => {
                const initialized = new Set<number>();
                let layoutCache: GPUBindGroupLayout | null = null;
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    if (!layoutCache) {
                        layoutCache = device.createBindGroupLayout({
                            entries: [
                                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                                { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                            ],
                        });
                    }
                    for (const arch of db.store.queryArchetypes(["pbrGeometryRef", "animationSkeletonRef"])) {
                        const ids = arch.columns.id;
                        const geoRefs = arch.columns.pbrGeometryRef;
                        const skelRefs = arch.columns.animationSkeletonRef;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const modelId = ids.get(i) as number;
                            if (initialized.has(modelId)) continue;
                            if ((skelRefs.get(i) as number) !== 0) {
                                initialized.add(modelId);
                                continue;
                            }
                            const geoId = geoRefs.get(i) as number;
                            const geo = db.store.read(geoId) as {
                                skinJointTemplate?: JointTemplate[];
                                animationClipRefs?: number[];
                            } | null;
                            const template = geo?.skinJointTemplate;
                            if (!template || template.length === 0) continue;
                            initialized.add(modelId);

                            const instanceBuffer = device.createBuffer({
                                size: 64,
                                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                            });
                            const matrixBuffer = device.createBuffer({
                                size: template.length * 64,
                                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                            });
                            const matrixBindGroup = device.createBindGroup({
                                layout: layoutCache,
                                entries: [
                                    { binding: 0, resource: { buffer: instanceBuffer } },
                                    { binding: 1, resource: { buffer: matrixBuffer } },
                                ],
                            });
                            db.transactions.pbrInitSkeleton({
                                modelRef: modelId,
                                geometryRef: geoId,
                                jointTemplate: template,
                                instanceBuffer,
                                jointMatrixBuffer: matrixBuffer,
                                jointMatrixBindGroup: matrixBindGroup,
                                clipRef: geo?.animationClipRefs?.[0] ?? null,
                            });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
        pbrSkinningMatrixSystem: {
            create: db => {
                let scratch = new Float32Array(0);
                return () => {
                    const { device, worldMatrices } = db.store.resources;
                    if (!device || !worldMatrices) return;
                    for (const arch of db.store.queryArchetypes([
                        "skeletonJoints",
                        "skeletonGeometryRef",
                        "skeletonModelRef",
                        "skeletonInstanceBuffer",
                        "skeletonJointMatrixBuffer",
                    ])) {
                        const jointsCol = arch.columns.skeletonJoints;
                        const geoCol = arch.columns.skeletonGeometryRef;
                        const modelCol = arch.columns.skeletonModelRef;
                        const instBufCol = arch.columns.skeletonInstanceBuffer;
                        const bufCol = arch.columns.skeletonJointMatrixBuffer;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const joints = jointsCol.get(i) as number[];
                            const geoId = geoCol.get(i) as number;
                            const modelId = modelCol.get(i) as number;
                            const instanceBuffer = instBufCol.get(i) as GPUBuffer | null;
                            const buffer = bufCol.get(i) as GPUBuffer | null;
                            if (!buffer || !instanceBuffer) continue;
                            const geo = db.store.read(geoId) as { skinInverseBindMatrices?: Float32Array | null } | null;
                            const ibm = geo?.skinInverseBindMatrices;
                            if (!ibm) continue;
                            const modelWorld = worldMatrices.get(modelId);
                            if (!modelWorld) continue;

                            // Instance buffer carries the Model's world matrix; the shader's
                            // `instances[0]` slot. The vertex shader applies it to the
                            // skin-blended position.
                            device.queue.writeBuffer(instanceBuffer, 0, new Float32Array(modelWorld));

                            const invModelWorld = Mat4x4.inverse(modelWorld);
                            if (scratch.length < joints.length * 16) {
                                scratch = new Float32Array(joints.length * 16);
                            }
                            for (let j = 0; j < joints.length; j++) {
                                const jw = worldMatrices.get(joints[j]) ?? Mat4x4.identity;
                                // skinningMatrix = inverse(modelWorld) × jointWorld × IBM —
                                // leaves vertices in model-local space so the shader's
                                // separate instance-matrix multiply gives world-space output.
                                const ibmJoint: Mat4x4 = [
                                    ibm[j * 16 + 0], ibm[j * 16 + 1], ibm[j * 16 + 2], ibm[j * 16 + 3],
                                    ibm[j * 16 + 4], ibm[j * 16 + 5], ibm[j * 16 + 6], ibm[j * 16 + 7],
                                    ibm[j * 16 + 8], ibm[j * 16 + 9], ibm[j * 16 + 10], ibm[j * 16 + 11],
                                    ibm[j * 16 + 12], ibm[j * 16 + 13], ibm[j * 16 + 14], ibm[j * 16 + 15],
                                ];
                                const m = Mat4x4.multiply(Mat4x4.multiply(invModelWorld, jw), ibmJoint);
                                scratch.set(m, j * 16);
                            }
                            device.queue.writeBuffer(buffer, 0, scratch, 0, joints.length * 16);
                        }
                    }
                };
            },
            schedule: { during: ["preRender"], after: ["transformSystem"] },
        },
    },
});
