// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
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
                let sceneBindGroup: GPUBindGroup | null = null;
                let cachedSceneBuffer: GPUBuffer | null = null;

                return () => {
                    const { device, renderPassEncoder, canvasFormat, depthFormat, sceneUniformsBuffer } = db.store.resources;
                    if (!device || !renderPassEncoder || !sceneUniformsBuffer) return;

                    if (!sceneLayout) sceneLayout = createSceneBindGroupLayout(device);
                    if (!materialLayout) materialLayout = createMaterialBindGroupLayout(device);

                    if (!pipeline) {
                        const module = device.createShaderModule({ code: shaderSource });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout],
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

                    const visibleGeo = new Set<number>();
                    for (const arch of db.store.queryArchetypes(["pbrGeometryRef", "visible"])) {
                        const refs = arch.columns.pbrGeometryRef;
                        const vis = arch.columns.visible;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (vis.get(i)) visibleGeo.add(refs.get(i) as number);
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

                    let lastMat: GPUBindGroup | null = null;
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
                            if (!visibleGeo.has(geoRefs.get(i) as number)) continue;
                            const mat = materialMap.get(matRefs.get(i) as number);
                            if (!mat) continue;
                            if (mat !== lastMat) {
                                renderPassEncoder.setBindGroup(1, mat);
                                lastMat = mat;
                            }
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i));
                            renderPassEncoder.setIndexBuffer(ibs.get(i), formats.get(i));
                            renderPassEncoder.drawIndexed(counts.get(i));
                        }
                    }
                };
            },
            schedule: { during: ["render"] }
        }
    }
});
