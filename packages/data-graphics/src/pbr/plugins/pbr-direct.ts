// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4, Quat, Vec3 } from "@adobe/data/math";
import { defaultSceneUniforms } from "../../plugins/default-scene-uniforms.js";
import { node } from "../../plugins/node.js";
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
    extends: Database.Plugin.combine(pbrCore, defaultSceneUniforms, node),
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
                const instanceCache = new Map<number, InstanceEntry>();

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

                    // Collect per-geometry instance matrices from visible Model entities.
                    const instancesByGeo = new Map<number, Float32Array>();
                    for (const arch of db.store.queryArchetypes(["pbrGeometryRef", "visible", "position", "rotation", "scale"])) {
                        const geoRefs = arch.columns.pbrGeometryRef;
                        const vis = arch.columns.visible;
                        const positions = arch.columns.position;
                        const rotations = arch.columns.rotation;
                        const scales = arch.columns.scale;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const geoId = geoRefs.get(i) as number;
                            const pos = positions.get(i) as Vec3;
                            const rot = rotations.get(i) as Quat;
                            const scl = scales.get(i) as Vec3;
                            const m = Mat4x4.multiply(
                                Mat4x4.translation(pos[0], pos[1], pos[2]),
                                Mat4x4.multiply(Quat.toMat4(rot), Mat4x4.scaling(scl[0], scl[1], scl[2])),
                            );
                            let arr = instancesByGeo.get(geoId);
                            if (!arr) {
                                arr = new Float32Array(16);
                                instancesByGeo.set(geoId, arr);
                            } else {
                                const grown = new Float32Array(arr.length + 16);
                                grown.set(arr);
                                arr = grown;
                                instancesByGeo.set(geoId, arr);
                            }
                            arr.set(m, arr.length - 16);
                        }
                    }

                    // Upload instance matrices and build per-geometry bind groups.
                    const instanceBindGroups = new Map<number, GPUBindGroup>();
                    for (const [geoId, matrices] of instancesByGeo) {
                        let entry = instanceCache.get(geoId);
                        if (!entry || entry.capacity < matrices.length / 16) {
                            entry?.buffer.destroy();
                            const buffer = device.createBuffer({
                                size: Math.max(matrices.byteLength, 64),
                                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                            });
                            const bindGroup = device.createBindGroup({
                                layout: instanceLayout,
                                entries: [{ binding: 0, resource: { buffer } }],
                            });
                            entry = { buffer, bindGroup, capacity: matrices.length / 16 };
                            instanceCache.set(geoId, entry);
                        }
                        device.queue.writeBuffer(entry.buffer, 0, matrices);
                        instanceBindGroups.set(geoId, entry.bindGroup);
                    }

                    const materialMap = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes(["pbrMaterialBindGroup"])) {
                        const ids = arch.columns.id;
                        const bgs = arch.columns.pbrMaterialBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            materialMap.set(ids.get(i) as number, bgs.get(i));
                        }
                    }

                    let lastMat: GPUBindGroup | null = null;
                    let lastInstBG: GPUBindGroup | null = null;
                    for (const archetype of db.store.queryArchetypes([
                        "pbrVertexBuffer",
                        "pbrIndexBuffer",
                        "pbrIndexCount",
                        "pbrIndexFormat",
                        "pbrMaterialRef",
                        "pbrGeometryRef",
                    ])) {
                        const vbs = archetype.columns.pbrVertexBuffer;
                        const ibs = archetype.columns.pbrIndexBuffer;
                        const counts = archetype.columns.pbrIndexCount;
                        const formats = archetype.columns.pbrIndexFormat;
                        const matRefs = archetype.columns.pbrMaterialRef;
                        const geoRefs = archetype.columns.pbrGeometryRef;
                        for (let i = 0; i < archetype.rowCount; i++) {
                            const geoId = geoRefs.get(i) as number;
                            const instBG = instanceBindGroups.get(geoId);
                            if (!instBG) continue;
                            const instCount = instancesByGeo.get(geoId)!.length / 16;
                            const mat = materialMap.get(matRefs.get(i) as number);
                            if (!mat) continue;
                            if (mat !== lastMat) {
                                renderPassEncoder.setBindGroup(1, mat);
                                lastMat = mat;
                            }
                            if (instBG !== lastInstBG) {
                                renderPassEncoder.setBindGroup(2, instBG);
                                lastInstBG = instBG;
                            }
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i));
                            renderPassEncoder.setIndexBuffer(ibs.get(i), formats.get(i));
                            renderPassEncoder.drawIndexed(counts.get(i), instCount);
                        }
                    }
                };
            },
            schedule: { during: ["render"] }
        }
    }
});
