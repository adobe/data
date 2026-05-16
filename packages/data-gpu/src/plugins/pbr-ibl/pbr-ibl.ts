// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4, Vec3 } from "@adobe/data/math";
import { defaultSceneUniforms } from "../default-scene-uniforms.js";
import { transform } from "../transform.js";
import { createMaterialBindGroupLayout, createSceneBindGroupLayout } from "../bind-group-layouts.js";
import { buildIblResources } from "./ibl/build-ibl-resources.js";
import { parseHdr } from "./ibl/parse-hdr.js";
import { StandardVertex } from "../../types/standard-vertex/standard-vertex.js";
import { SkinningAttributes } from "../../types/skinning-attributes/skinning-attributes.js";
import { pbrCore } from "../pbr-core.js";
import { buildIblShader } from "./ibl-shader.wgsl.js";
import skyboxShader from "./skybox-shader.wgsl.js";

const PREFILTERED_MIP_COUNT = 7;

function createIblBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    return device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });
}

function createSkyboxBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    return device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "cube" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        ],
    });
}

/**
 * Image-Based Lighting PBR renderer. Precomputes a procedural studio (or HDR-
 * sourced) environment + diffuse irradiance + GGX-prefiltered specular + BRDF
 * LUT once when the GPU device is available, then renders the environment as
 * a skybox followed by all `PbrPrimitive` entities using split-sum IBL plus a
 * single-light direct contribution.
 *
 * Mutually exclusive with `pbrDirect` — both iterate the same archetype.
 */
export const pbrIbl = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, defaultSceneUniforms, transform),
    resources: {
        iblEnvironmentUrl: { default: null as string | null, transient: true },
        iblEnvironmentMap: { default: null as GPUTexture | null, transient: true },
        iblIrradianceMap: { default: null as GPUTexture | null, transient: true },
        iblPrefilteredMap: { default: null as GPUTexture | null, transient: true },
        iblBrdfLut: { default: null as GPUTexture | null, transient: true },
    },
    transactions: {
        setIblEnvironmentUrl(t, url: string | null) {
            t.resources.iblEnvironmentUrl = url;
        },
    },
    systems: {
        pbrIblInit: {
            create: db => {
                let started = false;
                return () => {
                    if (started) return;
                    const { device, iblEnvironmentUrl } = db.store.resources;
                    if (!device) return;
                    started = true;

                    const buildAndAssign = (hdr?: Awaited<ReturnType<typeof parseHdr>>) => {
                        const r = buildIblResources(device, {
                            prefilteredMipCount: PREFILTERED_MIP_COUNT,
                            hdrSource: hdr,
                        });
                        db.store.resources.iblEnvironmentMap = r.environment;
                        db.store.resources.iblIrradianceMap = r.irradiance;
                        db.store.resources.iblPrefilteredMap = r.prefiltered;
                        db.store.resources.iblBrdfLut = r.brdfLut;
                    };

                    if (iblEnvironmentUrl) {
                        fetch(iblEnvironmentUrl)
                            .then(r => {
                                if (!r.ok) throw new Error(`HDR fetch failed: ${r.status}`);
                                return r.arrayBuffer();
                            })
                            .then(buf => {
                                buildAndAssign(parseHdr(buf));
                            })
                            .catch(err => {
                                console.warn("[pbrIbl] HDR load failed; using procedural fallback", err);
                                buildAndAssign();
                            });
                    } else {
                        buildAndAssign();
                    }
                };
            },
            schedule: { during: ["preRender"] }
        },
        pbrIblRender: {
            create: db => {
                let pipeline: GPURenderPipeline | null = null;
                let skinnedPipeline: GPURenderPipeline | null = null;
                let skyboxPipeline: GPURenderPipeline | null = null;
                let sceneLayout: GPUBindGroupLayout | null = null;
                let materialLayout: GPUBindGroupLayout | null = null;
                let iblLayout: GPUBindGroupLayout | null = null;
                let instanceLayout: GPUBindGroupLayout | null = null;
                let skinnedInstanceLayout: GPUBindGroupLayout | null = null;
                let skyboxLayout: GPUBindGroupLayout | null = null;
                let iblSampler: GPUSampler | null = null;
                let skyboxUniformBuffer: GPUBuffer | null = null;
                let sceneBindGroup: GPUBindGroup | null = null;
                let iblBindGroup: GPUBindGroup | null = null;
                let skyboxBindGroup: GPUBindGroup | null = null;
                let cachedSceneBuffer: GPUBuffer | null = null;
                let cachedIblIrradiance: GPUTexture | null = null;
                let cachedSkyEnvironment: GPUTexture | null = null;
                // std140 layout: 3 × vec3 each followed by a scalar packed
                // into the 4th lane. 48 bytes total.
                const skyboxScratch = new Float32Array(12);
                type InstanceEntry = { buffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number };
                // Keyed by primitive entity ID; each primitive may have a different
                // pbrNodeLocalMatrix so effective instance matrices differ per primitive.
                const instanceCache = new Map<number, InstanceEntry>();
                let instanceScratch = new Float32Array(16);

                return () => {
                    const {
                        device, renderPassEncoder, canvasFormat, depthFormat, sceneUniformsBuffer,
                        iblEnvironmentMap, iblIrradianceMap, iblPrefilteredMap, iblBrdfLut, camera,
                    } = db.store.resources;
                    if (!device || !renderPassEncoder || !sceneUniformsBuffer || !camera) return;
                    if (!iblEnvironmentMap || !iblIrradianceMap || !iblPrefilteredMap || !iblBrdfLut) return;

                    if (!sceneLayout) sceneLayout = createSceneBindGroupLayout(device);
                    if (!materialLayout) materialLayout = createMaterialBindGroupLayout(device);
                    if (!iblLayout) iblLayout = createIblBindGroupLayout(device);
                    if (!instanceLayout) instanceLayout = device.createBindGroupLayout({
                        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } }],
                    });
                    if (!skinnedInstanceLayout) skinnedInstanceLayout = device.createBindGroupLayout({
                        entries: [
                            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                        ],
                    });
                    if (!skyboxLayout) skyboxLayout = createSkyboxBindGroupLayout(device);
                    if (!iblSampler) {
                        iblSampler = device.createSampler({
                            magFilter: "linear",
                            minFilter: "linear",
                            mipmapFilter: "linear",
                            addressModeU: "clamp-to-edge",
                            addressModeV: "clamp-to-edge",
                            addressModeW: "clamp-to-edge",
                        });
                    }
                    if (!skyboxUniformBuffer) {
                        skyboxUniformBuffer = device.createBuffer({
                            size: 48,
                            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        });
                    }

                    if (!pipeline) {
                        const module = device.createShaderModule({
                            code: buildIblShader({ prefilteredMipCount: PREFILTERED_MIP_COUNT, skinned: false }),
                        });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout, iblLayout, instanceLayout],
                            }),
                            vertex: { module, entryPoint: "vs_main", buffers: [StandardVertex.layout] },
                            fragment: { module, entryPoint: "fs_main", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list", cullMode: "back" },
                            depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" },
                        });
                    }
                    if (!skinnedPipeline) {
                        const module = device.createShaderModule({
                            code: buildIblShader({ prefilteredMipCount: PREFILTERED_MIP_COUNT, skinned: true }),
                        });
                        skinnedPipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout, iblLayout, skinnedInstanceLayout],
                            }),
                            vertex: { module, entryPoint: "vs_main", buffers: [StandardVertex.layout, SkinningAttributes.layout] },
                            fragment: { module, entryPoint: "fs_main", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list", cullMode: "back" },
                            depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" },
                        });
                    }
                    if (!skyboxPipeline) {
                        const sm = device.createShaderModule({ code: skyboxShader });
                        skyboxPipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({ bindGroupLayouts: [skyboxLayout] }),
                            vertex: { module: sm, entryPoint: "vs_skybox" },
                            fragment: { module: sm, entryPoint: "fs_skybox", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list" },
                            depthStencil: { format: depthFormat, depthWriteEnabled: false, depthCompare: "always" },
                        });
                    }

                    if (sceneUniformsBuffer !== cachedSceneBuffer || !sceneBindGroup) {
                        sceneBindGroup = device.createBindGroup({
                            layout: sceneLayout,
                            entries: [{ binding: 0, resource: { buffer: sceneUniformsBuffer } }],
                        });
                        cachedSceneBuffer = sceneUniformsBuffer;
                    }
                    if (iblIrradianceMap !== cachedIblIrradiance || !iblBindGroup) {
                        iblBindGroup = device.createBindGroup({
                            layout: iblLayout,
                            entries: [
                                { binding: 0, resource: iblIrradianceMap.createView({ dimension: "cube" }) },
                                { binding: 1, resource: iblPrefilteredMap.createView({ dimension: "cube" }) },
                                { binding: 2, resource: iblBrdfLut.createView() },
                                { binding: 3, resource: iblSampler },
                            ],
                        });
                        cachedIblIrradiance = iblIrradianceMap;
                    }
                    if (iblEnvironmentMap !== cachedSkyEnvironment || !skyboxBindGroup) {
                        skyboxBindGroup = device.createBindGroup({
                            layout: skyboxLayout,
                            entries: [
                                { binding: 0, resource: { buffer: skyboxUniformBuffer } },
                                { binding: 1, resource: iblEnvironmentMap.createView({ dimension: "cube" }) },
                                { binding: 2, resource: iblSampler },
                            ],
                        });
                        cachedSkyEnvironment = iblEnvironmentMap;
                    }

                    // Camera basis for the skybox view rays.
                    const forward = Vec3.normalize(Vec3.subtract(camera.target, camera.position));
                    const right = Vec3.normalize(Vec3.cross(forward, camera.up));
                    const upOrtho = Vec3.cross(right, forward);
                    const tanHalfFov = Math.tan(camera.fieldOfView / 2);
                    skyboxScratch[0] = right[0];
                    skyboxScratch[1] = right[1];
                    skyboxScratch[2] = right[2];
                    skyboxScratch[3] = camera.aspect;
                    skyboxScratch[4] = upOrtho[0];
                    skyboxScratch[5] = upOrtho[1];
                    skyboxScratch[6] = upOrtho[2];
                    skyboxScratch[7] = tanHalfFov;
                    skyboxScratch[8] = forward[0];
                    skyboxScratch[9] = forward[1];
                    skyboxScratch[10] = forward[2];
                    skyboxScratch[11] = 0;
                    device.queue.writeBuffer(skyboxUniformBuffer, 0, skyboxScratch);

                    renderPassEncoder.setPipeline(skyboxPipeline);
                    renderPassEncoder.setBindGroup(0, skyboxBindGroup);
                    renderPassEncoder.draw(3);

                    // Collect visible Models grouped by geometry, keeping ids alongside
                    // matrices so the skinned path can look up each instance's skeleton.
                    const { worldMatrices } = db.store.resources;
                    interface ModelEntry { id: number; matrix: Mat4x4 }
                    const modelsByGeo = new Map<number, ModelEntry[]>();
                    for (const arch of db.store.queryArchetypes(["pbrGeometryRef", "visible"])) {
                        const ids = arch.columns.id;
                        const geoRefs = arch.columns.pbrGeometryRef;
                        const vis = arch.columns.visible;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const id = ids.get(i) as number;
                            const m = worldMatrices.get(id);
                            if (!m) continue;
                            const geoId = geoRefs.get(i) as number;
                            let arr = modelsByGeo.get(geoId);
                            if (!arr) { arr = []; modelsByGeo.set(geoId, arr); }
                            arr.push({ id, matrix: m });
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

                    const jointBindGroupByModel = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes([
                        "skeletonModelRef",
                        "skeletonJointMatrixBindGroup",
                    ])) {
                        const modelRefs = arch.columns.skeletonModelRef;
                        const bgs = arch.columns.skeletonJointMatrixBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const bg = bgs.get(i) as GPUBindGroup | null;
                            if (bg) jointBindGroupByModel.set(modelRefs.get(i) as number, bg);
                        }
                    }

                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

                    let lastPipeline: GPURenderPipeline | null = null;
                    let lastMat: GPUBindGroup | null = null;
                    let lastInstBG: GPUBindGroup | null = null;
                    for (const archetype of db.store.queryArchetypes([
                        "pbrVertexBuffer",
                        "pbrSkinVertexBuffer",
                        "pbrIndexBuffer",
                        "pbrIndexCount",
                        "pbrIndexFormat",
                        "pbrMaterialRef",
                        "pbrGeometryRef",
                        "pbrNodeLocalMatrix",
                    ])) {
                        const vbs = archetype.columns.pbrVertexBuffer;
                        const skinVbs = archetype.columns.pbrSkinVertexBuffer;
                        const ibs = archetype.columns.pbrIndexBuffer;
                        const counts = archetype.columns.pbrIndexCount;
                        const formats = archetype.columns.pbrIndexFormat;
                        const matRefs = archetype.columns.pbrMaterialRef;
                        const geoRefs = archetype.columns.pbrGeometryRef;
                        const nodeMats = archetype.columns.pbrNodeLocalMatrix;
                        const primIds = archetype.columns.id;
                        for (let i = 0; i < archetype.rowCount; i++) {
                            const geoId = geoRefs.get(i) as number;
                            const models = modelsByGeo.get(geoId);
                            if (!models) continue;

                            const skinBuf = skinVbs.get(i) as GPUBuffer | null;
                            const nodeMatrix = nodeMats.get(i) as Mat4x4;
                            const primId = primIds.get(i) as number;
                            const mat = materialMap.get(matRefs.get(i) as number);
                            if (!mat) continue;

                            if (skinBuf) {
                                // Skinned: one draw per Model. The skeleton owns a
                                // 2-binding bind group containing both the per-Model
                                // instance matrix and the per-Model joint matrices.
                                if (lastPipeline !== skinnedPipeline) {
                                    renderPassEncoder.setPipeline(skinnedPipeline);
                                    lastPipeline = skinnedPipeline;
                                    lastInstBG = null;
                                }
                                if (mat !== lastMat) {
                                    renderPassEncoder.setBindGroup(1, mat);
                                    lastMat = mat;
                                }
                                renderPassEncoder.setVertexBuffer(0, vbs.get(i));
                                renderPassEncoder.setVertexBuffer(1, skinBuf);
                                renderPassEncoder.setIndexBuffer(ibs.get(i), formats.get(i));
                                for (const model of models) {
                                    const skeletonBG = jointBindGroupByModel.get(model.id);
                                    if (!skeletonBG) continue;
                                    if (skeletonBG !== lastInstBG) {
                                        renderPassEncoder.setBindGroup(3, skeletonBG);
                                        lastInstBG = skeletonBG;
                                    }
                                    renderPassEncoder.drawIndexed(counts.get(i), 1);
                                }
                                continue;
                            }

                            // Static: instanced draw.
                            if (lastPipeline !== pipeline) {
                                renderPassEncoder.setPipeline(pipeline);
                                lastPipeline = pipeline;
                                lastInstBG = null;
                            }
                            const instCount = models.length;
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
                                instanceScratch.set(Mat4x4.multiply(models[j].matrix, nodeMatrix), j * 16);
                            }
                            device.queue.writeBuffer(entry.buffer, 0, instanceScratch, 0, instCount * 16);

                            if (mat !== lastMat) {
                                renderPassEncoder.setBindGroup(1, mat);
                                lastMat = mat;
                            }
                            if (entry.bindGroup !== lastInstBG) {
                                renderPassEncoder.setBindGroup(3, entry.bindGroup);
                                lastInstBG = entry.bindGroup;
                            }
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i));
                            renderPassEncoder.setIndexBuffer(ibs.get(i), formats.get(i));
                            renderPassEncoder.drawIndexed(counts.get(i), instCount);
                        }
                    }
                };
            },
            schedule: { during: ["render"], after: ["pbrIblInit", "transformSystem"] }
        }
    }
});
