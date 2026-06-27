// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Mat4x4, Vec3 } from "@adobe/data/math";
import { pbrCore } from "../pbr-core-plugin.js";
import { modelLoader } from "../../scene/model/model-loader-plugin.js";
import { transform } from "../../scene/node/transform-plugin.js";
import { buildIblResources } from "./ibl/build-ibl-resources.js";
import { parseHdr } from "./ibl/parse-hdr.js";
import { VisibleMaterial } from "../visible-material/visible-material.js";
import { SceneUniforms } from "../../scene/scene-uniforms/scene-uniforms.js";
import { StandardVertex } from "../standard-vertex/standard-vertex.js";
import { SkinningAttributes } from "../skinning/skinning-attributes/skinning-attributes.js";
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
 * pbrIblRender — IBL PBR rendering aggregator. Combines the implementation
 * plugins needed to draw `Model` entities with image-based lighting:
 *
 *   - pbrCore         (ephemeral primitive/material shape declarations)
 *   - modelLoader     (glTF → primitives)
 *   - SceneUniforms.plugin (camera + light packed into a GPU buffer)
 *   - transform       (Node TRS → _worldMatrix)
 *
 * The render system is skin-aware — if a primitive has a `_skinVertexBuffer`,
 * it uses the skinned pipeline and looks up the matching joint bind group.
 * Add `pbrSkinning` separately to populate those joint matrices for skinned
 * meshes.
 *
 * Adds its own systems:
 *   - iblInitSystem    : light.environmentUrl → IBL cube/2D textures
 *   - pbrIblRenderSystem: visible Models → drawIndexed calls
 *
 * `_PbrPrimitive` archetype.
 */
export const pbrIblRender = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrCore, modelLoader, SceneUniforms.plugin, transform),
    resources: {
        _iblEnvironment:  { default: null as GPUTexture | null, nonPersistent: true },
        _iblIrradiance:   { default: null as GPUTexture | null, nonPersistent: true },
        _iblPrefiltered:  { default: null as GPUTexture | null, nonPersistent: true },
        _iblBrdfLut:      { default: null as GPUTexture | null, nonPersistent: true },
    },
    systems: {
        iblInitSystem: {
            create: db => {
                let started = false;
                return () => {
                    if (started) return;
                    const { device, light } = db.store.resources;
                    if (!device) return;
                    const environmentUrl = light.environmentUrl;
                    started = true;

                    const buildAndAssign = (hdr?: Awaited<ReturnType<typeof parseHdr>>) => {
                        const r = buildIblResources(device, {
                            prefilteredMipCount: PREFILTERED_MIP_COUNT,
                            hdrSource: hdr,
                        });
                        db.store.resources._iblEnvironment = r.environment;
                        db.store.resources._iblIrradiance = r.irradiance;
                        db.store.resources._iblPrefiltered = r.prefiltered;
                        db.store.resources._iblBrdfLut = r.brdfLut;
                    };

                    if (environmentUrl) {
                        fetch(environmentUrl)
                            .then(r => {
                                if (!r.ok) throw new Error(`HDR fetch failed: ${r.status}`);
                                return r.arrayBuffer();
                            })
                            .then(buf => buildAndAssign(parseHdr(buf)))
                            .catch(err => {
                                console.warn("[_pbrIblRender] HDR load failed; using procedural fallback", err);
                                buildAndAssign();
                            });
                    } else {
                        buildAndAssign();
                    }
                };
            },
            schedule: { during: ["preRender"] },
        },
        pbrIblRenderSystem: {
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
                const skyboxScratch = new Float32Array(12);
                type InstanceEntry = { buffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number };
                const instanceCache = new Map<number, InstanceEntry>();
                let instanceScratch = new Float32Array(16);

                return () => {
                    const {
                        device, renderPassEncoder, canvasFormat, depthFormat, _sceneUniformsBuffer,
                        _iblEnvironment, _iblIrradiance, _iblPrefiltered, _iblBrdfLut, camera,
                    } = db.store.resources;
                    if (!device || !renderPassEncoder || !_sceneUniformsBuffer || !camera) return;
                    if (!_iblEnvironment || !_iblIrradiance || !_iblPrefiltered || !_iblBrdfLut) return;

                    if (!sceneLayout) sceneLayout = SceneUniforms.createBindGroupLayout(device);
                    if (!materialLayout) materialLayout = VisibleMaterial.createBindGroupLayout(device);
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

                    if (_sceneUniformsBuffer !== cachedSceneBuffer || !sceneBindGroup) {
                        sceneBindGroup = device.createBindGroup({
                            layout: sceneLayout,
                            entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }],
                        });
                        cachedSceneBuffer = _sceneUniformsBuffer;
                    }
                    if (_iblIrradiance !== cachedIblIrradiance || !iblBindGroup) {
                        iblBindGroup = device.createBindGroup({
                            layout: iblLayout,
                            entries: [
                                { binding: 0, resource: _iblIrradiance.createView({ dimension: "cube" }) },
                                { binding: 1, resource: _iblPrefiltered.createView({ dimension: "cube" }) },
                                { binding: 2, resource: _iblBrdfLut.createView() },
                                { binding: 3, resource: iblSampler },
                            ],
                        });
                        cachedIblIrradiance = _iblIrradiance;
                    }
                    if (_iblEnvironment !== cachedSkyEnvironment || !skyboxBindGroup) {
                        skyboxBindGroup = device.createBindGroup({
                            layout: skyboxLayout,
                            entries: [
                                { binding: 0, resource: { buffer: skyboxUniformBuffer } },
                                { binding: 1, resource: _iblEnvironment.createView({ dimension: "cube" }) },
                                { binding: 2, resource: iblSampler },
                            ],
                        });
                        cachedSkyEnvironment = _iblEnvironment;
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

                    // Collect visible Models grouped by geometry. World matrix comes
                    // from each Model's `_worldMatrix` component (written by _transform).
                    interface ModelEntry { id: number; matrix: Mat4x4 }
                    const modelsByGeo = new Map<number, ModelEntry[]>();
                    for (const arch of db.store.queryArchetypes(["mesh", "visible", "_worldMatrix"])) {
                        const ids = arch.columns.id;
                        const meshRefs = arch.columns.mesh;
                        const vis = arch.columns.visible;
                        const worldMats = arch.columns._worldMatrix;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const id = ids.get(i);
                            const m = worldMats.get(i);
                            const meshId = meshRefs.get(i);
                            let arr = modelsByGeo.get(meshId);
                            if (!arr) { arr = []; modelsByGeo.set(meshId, arr); }
                            arr.push({ id, matrix: m });
                        }
                    }

                    const materialMap = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes(["_materialBindGroup"])) {
                        const ids = arch.columns.id;
                        const bgs = arch.columns._materialBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const bg = bgs.get(i); if (bg) materialMap.set(ids.get(i), bg);
                        }
                    }

                    const jointBindGroupByModel = new Map<number, GPUBindGroup>();
                    for (const arch of db.store.queryArchetypes([
                        "_skeletonModelRef",
                        "_skeletonJointMatrixBindGroup",
                    ])) {
                        const modelRefs = arch.columns._skeletonModelRef;
                        const bgs = arch.columns._skeletonJointMatrixBindGroup;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const bg = bgs.get(i);
                            if (bg) jointBindGroupByModel.set(modelRefs.get(i), bg);
                        }
                    }

                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

                    let lastPipeline: GPURenderPipeline | null = null;
                    let lastMat: GPUBindGroup | null = null;
                    let lastInstBG: GPUBindGroup | null = null;
                    for (const archetype of db.store.queryArchetypes([
                        "_vertexBuffer",
                        "_skinVertexBuffer",
                        "_indexBuffer",
                        "_indexCount",
                        "_indexFormat",
                        "_material",
                        "_mesh",
                        "_nodeLocalMatrix",
                    ])) {
                        const vbs = archetype.columns._vertexBuffer;
                        const skinVbs = archetype.columns._skinVertexBuffer;
                        const ibs = archetype.columns._indexBuffer;
                        const counts = archetype.columns._indexCount;
                        const formats = archetype.columns._indexFormat;
                        const matRefs = archetype.columns._material;
                        const meshRefs = archetype.columns._mesh;
                        const nodeMats = archetype.columns._nodeLocalMatrix;
                        const primIds = archetype.columns.id;
                        for (let i = 0; i < archetype.rowCount; i++) {
                            const meshId = meshRefs.get(i);
                            const models = modelsByGeo.get(meshId);
                            if (!models) continue;

                            const skinBuf = skinVbs.get(i);
                            const nodeMatrix = nodeMats.get(i);
                            const primId = primIds.get(i);
                            const mat = materialMap.get(matRefs.get(i));
                            if (!mat) continue;

                            if (skinBuf) {
                                // Skinned: one draw per Model; the skeleton owns the
                                // 2-binding bind group with instance + joint matrices.
                                if (lastPipeline !== skinnedPipeline) {
                                    renderPassEncoder.setPipeline(skinnedPipeline);
                                    lastPipeline = skinnedPipeline;
                                    lastInstBG = null;
                                }
                                if (mat !== lastMat) {
                                    renderPassEncoder.setBindGroup(1, mat);
                                    lastMat = mat;
                                }
                                renderPassEncoder.setVertexBuffer(0, vbs.get(i)!); // _PbrPrimitive archetype guarantees non-null
                                renderPassEncoder.setVertexBuffer(1, skinBuf);
                                renderPassEncoder.setIndexBuffer(ibs.get(i)!, formats.get(i)); // _PbrPrimitive archetype guarantees non-null
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
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i)!); // _PbrPrimitive archetype guarantees non-null
                            renderPassEncoder.setIndexBuffer(ibs.get(i)!, formats.get(i)); // _PbrPrimitive archetype guarantees non-null
                            renderPassEncoder.drawIndexed(counts.get(i), instCount);
                        }
                    }
                };
            },
            schedule: { during: ["render"], after: ["beginRenderPass", "iblInitSystem", "transformSystem"], before: ["endRenderPass"] },
        },
    },
});
