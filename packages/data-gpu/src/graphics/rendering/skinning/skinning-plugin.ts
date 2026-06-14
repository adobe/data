// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { modelLoader } from "../../scene/model/model-loader-plugin.js";
import { pbrCore } from "../pbr-core-plugin.js";
import { transform } from "../../scene/node/transform-plugin.js";
import { animation } from "../../animation/animation-plugin.js";
import type { JointTemplate } from "../../scene/model/gltf/parse-skin.js";

/**
 * pbrSkinning — builds a `_Skeleton` for each `Model` whose `mesh` is a
 * `SkinnedMesh` (non-empty `skinJointTemplate`).
 */
export const pbrSkinning = Database.Plugin.create({
    extends: Database.Plugin.combine(modelLoader, pbrCore, transform, animation),
    components: {
        _skeletonJoints:                  { default: [] as number[] },
        _skeletonMesh:                    Entity.schema,
        _skeletonInstanceBuffer:          { default: null as GPUBuffer | null },
        _skeletonJointMatrixBuffer:       { default: null as GPUBuffer | null },
    },
    archetypes: {
        _Skeleton: [
            "_skeletonJoints",
            "_skeletonMesh",
            "_skeletonModelRef",
            "_skeletonInstanceBuffer",
            "_skeletonJointMatrixBuffer",
            "_skeletonJointMatrixBindGroup",
        ],
    },
    transactions: {
        initSkeleton(t, args: {
            modelRef: number;
            meshRef: number;
            jointTemplate: readonly JointTemplate[];
            instanceBuffer: GPUBuffer;
            jointMatrixBuffer: GPUBuffer;
            jointMatrixBindGroup: GPUBindGroup;
            clipRef: number | null;
        }) {
            const jointIds: number[] = new Array(args.jointTemplate.length);
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
            t.archetypes._Skeleton.insert({
                _skeletonJoints: jointIds,
                _skeletonMesh: args.meshRef,
                _skeletonModelRef: args.modelRef,
                _skeletonInstanceBuffer: args.instanceBuffer,
                _skeletonJointMatrixBuffer: args.jointMatrixBuffer,
                _skeletonJointMatrixBindGroup: args.jointMatrixBindGroup,
            });
            if (args.clipRef !== null) {
                t.archetypes.Animation.insert({
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
        skinningInitSystem: {
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
                    for (const arch of db.store.queryArchetypes(["mesh"])) {
                        const ids = arch.columns.id;
                        const meshRefs = arch.columns.mesh;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const modelId = ids.get(i);
                            if (initialized.has(modelId)) continue;
                            const meshId = meshRefs.get(i);
                            const asset = db.store.read(meshId) as {
                                skinJointTemplate?: JointTemplate[];
                                animationClipRefs?: number[];
                            } | null;
                            const template = asset?.skinJointTemplate;
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
                            db.transactions.initSkeleton({
                                modelRef: modelId,
                                meshRef: meshId,
                                jointTemplate: template,
                                instanceBuffer,
                                jointMatrixBuffer: matrixBuffer,
                                jointMatrixBindGroup: matrixBindGroup,
                                clipRef: asset?.animationClipRefs?.[0] ?? null,
                            });
                        }
                    }
                };
            },
            schedule: { during: ["preUpdate"] },
        },
        skinningMatrixSystem: {
            create: db => {
                let scratch = new Float32Array(0);
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;
                    for (const arch of db.store.queryArchetypes([
                        "_skeletonJoints",
                        "_skeletonMesh",
                        "_skeletonModelRef",
                        "_skeletonInstanceBuffer",
                        "_skeletonJointMatrixBuffer",
                    ])) {
                        const jointsCol = arch.columns._skeletonJoints;
                        const meshCol = arch.columns._skeletonMesh;
                        const modelCol = arch.columns._skeletonModelRef;
                        const instBufCol = arch.columns._skeletonInstanceBuffer;
                        const bufCol = arch.columns._skeletonJointMatrixBuffer;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const joints = jointsCol.get(i);
                            const meshId = meshCol.get(i);
                            const modelId = modelCol.get(i);
                            const instanceBuffer = instBufCol.get(i);
                            const buffer = bufCol.get(i);
                            if (!buffer || !instanceBuffer) continue;
                            const ibm = db.store.get(meshId, "skinInverseBindMatrices") as Float32Array | null;
                            if (!ibm) continue;
                            const modelWorld = db.store.get(modelId, "_worldMatrix");
                            if (!modelWorld) continue;

                            device.queue.writeBuffer(instanceBuffer, 0, new Float32Array(modelWorld));

                            const invModelWorld = Mat4x4.inverse(modelWorld);
                            if (scratch.length < joints.length * 16) {
                                scratch = new Float32Array(joints.length * 16);
                            }
                            for (let j = 0; j < joints.length; j++) {
                                const jw = db.store.get(joints[j], "_worldMatrix") ?? Mat4x4.identity;
                                const ibmJoint: Mat4x4 = [
                                    ibm[j * 16 + 0],  ibm[j * 16 + 1],  ibm[j * 16 + 2],  ibm[j * 16 + 3],
                                    ibm[j * 16 + 4],  ibm[j * 16 + 5],  ibm[j * 16 + 6],  ibm[j * 16 + 7],
                                    ibm[j * 16 + 8],  ibm[j * 16 + 9],  ibm[j * 16 + 10], ibm[j * 16 + 11],
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
