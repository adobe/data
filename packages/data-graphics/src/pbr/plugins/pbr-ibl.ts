// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import { defaultSceneUniforms } from "../../plugins/default-scene-uniforms.js";
import { node } from "../../plugins/node.js";
import { createMaterialBindGroupLayout, createSceneBindGroupLayout } from "../bind-group-layouts.js";
import { buildIblResources } from "../ibl/build-ibl-resources.js";
import { parseHdr } from "../ibl/parse-hdr.js";
import { StandardVertex } from "../types/standard-vertex/standard-vertex.js";
import { pbrCore } from "./pbr-core.js";
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
    extends: Database.Plugin.combine(pbrCore, defaultSceneUniforms, node),
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
                let skyboxPipeline: GPURenderPipeline | null = null;
                let sceneLayout: GPUBindGroupLayout | null = null;
                let materialLayout: GPUBindGroupLayout | null = null;
                let iblLayout: GPUBindGroupLayout | null = null;
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
                            code: buildIblShader({ prefilteredMipCount: PREFILTERED_MIP_COUNT }),
                        });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, materialLayout, iblLayout],
                            }),
                            vertex: { module, entryPoint: "vs_main", buffers: [StandardVertex.layout] },
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

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

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
            schedule: { during: ["render"], after: ["pbrIblInit"] }
        }
    }
});
