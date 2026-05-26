// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { modelLoader } from "../../model/model-loader-plugin.js";
import { pbrCore } from "../pbr-core-plugin.js";
import { transform } from "../../node/transform-plugin.js";
import { VisibleMaterial } from "../visible-material/visible-material.js";
import { SceneUniforms } from "../../scene-uniforms/scene-uniforms.js";
import { StandardVertex } from "../standard-vertex/standard-vertex.js";
import shaderSource from "./direct-shader.wgsl.js";

/**
 * pbrDirectRender — direct-lighting PBR rendering aggregator. Combines the
 * implementation plugins needed to draw `Model` entities with the scene's
 * single directional light + flat ambient (no IBL).
 *
 *   - pbrCore         (ephemeral primitive/material shape declarations)
 *   - modelLoader     (glTF → primitives)
 *   - SceneUniforms.plugin (camera + light packed into a GPU buffer)
 *   - transform       (Node TRS → _worldMatrix)
 *
 * Mutually exclusive with `pbrIblRender` — both iterate the same archetype.
 */
export const pbrDirectRender = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, modelLoader, SceneUniforms.plugin, transform),
    systems: {
        pbrDirectRenderSystem: {
            create: db => {
                let pipeline: GPURenderPipeline | null = null;
                let sceneLayout: GPUBindGroupLayout | null = null;
                let materialLayout: GPUBindGroupLayout | null = null;
                let instanceLayout: GPUBindGroupLayout | null = null;
                let sceneBindGroup: GPUBindGroup | null = null;
                let cachedSceneBuffer: GPUBuffer | null = null;
                type InstanceEntry = { buffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number };
                const instanceCache = new Map<number, InstanceEntry>();
                let instanceScratch = new Float32Array(16);

                return () => {
                    const { device, renderPassEncoder, canvasFormat, depthFormat, _sceneUniformsBuffer } = db.store.resources;
                    if (!device || !renderPassEncoder || !_sceneUniformsBuffer) return;

                    if (!sceneLayout) sceneLayout = SceneUniforms.createBindGroupLayout(device);
                    if (!materialLayout) materialLayout = VisibleMaterial.createBindGroupLayout(device);
                    if (!instanceLayout) instanceLayout = device.createBindGroupLayout({
                        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }],
                    });

                    if (!pipeline) {
                        const module = device.createShaderModule({ code: shaderSource });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout, instanceLayout],
                            }),
                            vertex: { module, entryPoint: "vs_main", buffers: [StandardVertex.layout] },
                            fragment: { module, entryPoint: "fs_main", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list", cullMode: "back" },
                            depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" },
                        });
                    }

                    if (_sceneUniformsBuffer !== cachedSceneBuffer || !sceneBindGroup) {
                        sceneBindGroup = device.createBindGroup({
                            layout: sceneLayout,
                            entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }],
                        });
                        cachedSceneBuffer = _sceneUniformsBuffer;
                    }

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);

                    // Collect visible Models grouped by geometry, world matrix from
                    // each Model's `_worldMatrix` (written by _transform).
                    const modelMatsByGeo = new Map<number, Mat4x4[]>();
                    for (const arch of db.store.queryArchetypes(["geometry", "visible", "_worldMatrix"])) {
                        const geoRefs = arch.columns.geometry;
                        const vis = arch.columns.visible;
                        const worldMats = arch.columns._worldMatrix;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const geoId = geoRefs.get(i);
                            const m = worldMats.get(i);
                            let arr = modelMatsByGeo.get(geoId);
                            if (!arr) { arr = []; modelMatsByGeo.set(geoId, arr); }
                            arr.push(m);
                        }
                    }

                    const materialMap = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes(["_materialBindGroup"])) {
                        const ids = arch.columns.id;
                        const bgs = arch.columns._materialBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            materialMap.set(ids.get(i), bgs.get(i));
                        }
                    }

                    let lastMat: GPUBindGroup | null = null;
                    let lastInstBG: GPUBindGroup | null = null;
                    for (const archetype of db.store.queryArchetypes([
                        "_vertexBuffer",
                        "_indexBuffer",
                        "_indexCount",
                        "_indexFormat",
                        "_material",
                        "_geometry",
                        "_nodeLocalMatrix",
                    ])) {
                        const vbs = archetype.columns._vertexBuffer;
                        const ibs = archetype.columns._indexBuffer;
                        const counts = archetype.columns._indexCount;
                        const formats = archetype.columns._indexFormat;
                        const matRefs = archetype.columns._material;
                        const geoRefs = archetype.columns._geometry;
                        const nodeMats = archetype.columns._nodeLocalMatrix;
                        const primIds = archetype.columns.id;
                        for (let i = 0; i < archetype.rowCount; i++) {
                            const geoId = geoRefs.get(i);
                            const modelMats = modelMatsByGeo.get(geoId);
                            if (!modelMats) continue;

                            const nodeMatrix = nodeMats.get(i);
                            const instCount = modelMats.length;
                            const primId = primIds.get(i);

                            let entry = instanceCache.get(primId);
                            if (!entry || entry.capacity < instCount) {
                                entry?.buffer.destroy();
                                const buffer = device.createBuffer({
                                    size: Math.max(instCount * 64, 64),
                                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                                });
                                const bindGroup = device.createBindGroup({
                                    layout: instanceLayout,
                                    entries: [{ binding: 0, resource: { buffer } }],
                                });
                                entry = { buffer, bindGroup, capacity: instCount };
                                instanceCache.set(primId, entry);
                            }
                            if (instanceScratch.length < instCount * 16) {
                                instanceScratch = new Float32Array(instCount * 16);
                            }
                            for (let j = 0; j < instCount; j++) {
                                instanceScratch.set(Mat4x4.multiply(modelMats[j], nodeMatrix), j * 16);
                            }
                            device.queue.writeBuffer(entry.buffer, 0, instanceScratch, 0, instCount * 16);

                            const mat = materialMap.get(matRefs.get(i));
                            if (!mat) continue;
                            if (mat !== lastMat) {
                                renderPassEncoder.setBindGroup(1, mat);
                                lastMat = mat;
                            }
                            if (entry.bindGroup !== lastInstBG) {
                                renderPassEncoder.setBindGroup(2, entry.bindGroup);
                                lastInstBG = entry.bindGroup;
                            }
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i));
                            renderPassEncoder.setIndexBuffer(ibs.get(i), formats.get(i));
                            renderPassEncoder.drawIndexed(counts.get(i), instCount);
                        }
                    }
                };
            },
            schedule: { during: ["render"], after: ["transformSystem"] },
        },
    },
});
