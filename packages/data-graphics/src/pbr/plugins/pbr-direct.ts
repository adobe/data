// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4 } from "@adobe/data/math";
import { defaultSceneUniforms } from "../../plugins/default-scene-uniforms.js";
import { transform } from "../../plugins/transform.js";
import { StandardVertex } from "../types/standard-vertex/standard-vertex.js";
import { createMaterialBindGroupLayout, createSceneBindGroupLayout } from "../bind-group-layouts.js";
import { pbrCore } from "./pbr-core.js";
import shaderSource from "./direct-shader.wgsl.js";

/**
 * Direct-lighting PBR renderer. Renders any entity matching the `pbrCore`
 * `PbrPrimitive` archetype using a metallic-roughness Cook-Torrance BRDF
 * driven by the scene's single directional light + flat ambient.
 *
 * Pick this OR (future) `pbrIbl` — not both, since both would iterate the
 * same archetype.
 */
export const pbrDirect = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, defaultSceneUniforms, transform),
    systems: {
        pbrDirectRender: {
            create: db => {
                let pipeline: GPURenderPipeline | null = null;
                let sceneLayout: GPUBindGroupLayout | null = null;
                let materialLayout: GPUBindGroupLayout | null = null;
                let instanceLayout: GPUBindGroupLayout | null = null;
                let sceneBindGroup: GPUBindGroup | null = null;
                let cachedSceneBuffer: GPUBuffer | null = null;
                type InstanceEntry = { buffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number };
                // Keyed by primitive entity ID; each primitive may have a different
                // pbrNodeLocalMatrix so effective instance matrices differ per primitive.
                const instanceCache = new Map<number, InstanceEntry>();
                let instanceScratch = new Float32Array(16);

                return () => {
                    const { device, renderPassEncoder, canvasFormat, depthFormat, sceneUniformsBuffer } = db.store.resources;
                    if (!device || !renderPassEncoder || !sceneUniformsBuffer) return;

                    if (!sceneLayout) sceneLayout = createSceneBindGroupLayout(device);
                    if (!materialLayout) materialLayout = createMaterialBindGroupLayout(device);
                    if (!instanceLayout) instanceLayout = device.createBindGroupLayout({
                        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }],
                    });

                    if (!pipeline) {
                        const module = device.createShaderModule({ code: shaderSource });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout, instanceLayout],
                            }),
                            vertex: {
                                module,
                                entryPoint: "vs_main",
                                buffers: [StandardVertex.layout],
                            },
                            fragment: {
                                module,
                                entryPoint: "fs_main",
                                targets: [{ format: canvasFormat }],
                            },
                            primitive: { topology: "triangle-list", cullMode: "back" },
                            depthStencil: {
                                format: depthFormat,
                                depthWriteEnabled: true,
                                depthCompare: "less",
                            },
                        });
                    }

                    if (sceneUniformsBuffer !== cachedSceneBuffer || !sceneBindGroup) {
                        sceneBindGroup = device.createBindGroup({
                            layout: sceneLayout,
                            entries: [{ binding: 0, resource: { buffer: sceneUniformsBuffer } }],
                        });
                        cachedSceneBuffer = sceneUniformsBuffer;
                    }

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);

                    // Collect world matrices of visible Model entities, grouped by geometry.
                    const { worldMatrices } = db.store.resources;
                    const modelMatsByGeo = new Map<number, Mat4x4[]>();
                    for (const arch of db.store.queryArchetypes(["pbrGeometryRef", "visible"])) {
                        const ids = arch.columns.id;
                        const geoRefs = arch.columns.pbrGeometryRef;
                        const vis = arch.columns.visible;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const geoId = geoRefs.get(i) as number;
                            const m = worldMatrices.get(ids.get(i) as number);
                            if (!m) continue;
                            let arr = modelMatsByGeo.get(geoId);
                            if (!arr) { arr = []; modelMatsByGeo.set(geoId, arr); }
                            arr.push(m);
                        }
                    }

                    const materialMap = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes(["pbrMaterialBindGroup"])) {
                        const ids = arch.columns.id;
                        const bgs = arch.columns.pbrMaterialBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            materialMap.set(ids.get(i) as number, bgs.get(i));
                        }
                    }

                    // For each primitive: pre-multiply modelWorldMatrix × pbrNodeLocalMatrix
                    // to get effective instance matrices, upload, and draw.
                    let lastMat: GPUBindGroup | null = null;
                    let lastInstBG: GPUBindGroup | null = null;
                    for (const archetype of db.store.queryArchetypes([
                        "pbrVertexBuffer",
                        "pbrIndexBuffer",
                        "pbrIndexCount",
                        "pbrIndexFormat",
                        "pbrMaterialRef",
                        "pbrGeometryRef",
                        "pbrNodeLocalMatrix",
                    ])) {
                        const vbs = archetype.columns.pbrVertexBuffer;
                        const ibs = archetype.columns.pbrIndexBuffer;
                        const counts = archetype.columns.pbrIndexCount;
                        const formats = archetype.columns.pbrIndexFormat;
                        const matRefs = archetype.columns.pbrMaterialRef;
                        const geoRefs = archetype.columns.pbrGeometryRef;
                        const nodeMats = archetype.columns.pbrNodeLocalMatrix;
                        const primIds = archetype.columns.id;
                        for (let i = 0; i < archetype.rowCount; i++) {
                            const geoId = geoRefs.get(i) as number;
                            const modelMats = modelMatsByGeo.get(geoId);
                            if (!modelMats) continue;

                            const nodeMatrix = nodeMats.get(i) as Mat4x4;
                            const instCount = modelMats.length;
                            const primId = primIds.get(i) as number;

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

                            const mat = materialMap.get(matRefs.get(i) as number);
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
            schedule: { during: ["render"], after: ["transformSystem"] }
        }
    }
});
