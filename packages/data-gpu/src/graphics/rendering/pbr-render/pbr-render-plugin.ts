// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { Mat4x4, Quat } from "@adobe/data/math";
import { graphics } from "../../graphics-plugin.js";
import { model } from "../../scene/model/model-plugin.js";
import { pbrCore } from "../pbr-core-plugin.js";
import { materialGpu } from "../material-gpu/material-gpu-plugin.js";
import { Light } from "../../scene/light/light.js";
import { SceneUniforms } from "../../scene/scene-uniforms/scene-uniforms.js";
import { StandardVertex } from "../standard-vertex/standard-vertex.js";
import { createMaterialBindGroupLayout } from "../material-gpu/material-bind-group.js";
import { buildIblResources } from "../ibl-render/ibl/build-ibl-resources.js";
import { parseHdr } from "../ibl-render/ibl/parse-hdr.js";
import { buildPbrArrayShader } from "./pbr-array-shader.wgsl.js";

const PREFILTERED_MIP_COUNT = 7;

/** Drawable components: any Model-shaped entity with a material reference. */
const DRAWABLE = ["geometry", "visible", "position", "rotation", "scale", "material"] as const;
const PRIMITIVE = ["_vertexBuffer", "_indexBuffer", "_indexCount", "_indexFormat", "_geometry", "_nodeLocalMatrix"] as const;

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

function trs(p: readonly number[], q: readonly [number, number, number, number], s: readonly number[]): Mat4x4 {
    return Mat4x4.multiply(
        Mat4x4.translation(p[0], p[1], p[2]),
        Mat4x4.multiply(Quat.toMat4(q), Mat4x4.scaling(s[0], s[1], s[2])),
    );
}

/**
 * pbrRender — the unified PBR + IBL renderer for instanced primitives (and,
 * after convergence, glTF). Binds the shared `materialGpu` set once and selects
 * a material per instance by its material entity's `_layerIndex`. Drawables are
 * any visible entity with a `geometry` ref + transform + `material`; their world
 * matrix is computed directly from `position`/`rotation`/`scale` (flat, no
 * hierarchy) and instanced per geometry into a single `drawIndexed`.
 */
export const pbrRender = Database.Plugin.create({
    extends: Database.Plugin.combine(graphics, SceneUniforms.plugin, materialGpu, pbrCore, model, Light.plugin),
    resources: {
        _iblEnvironment: { default: null as GPUTexture | null, transient: true },
        _iblIrradiance:  { default: null as GPUTexture | null, transient: true },
        _iblPrefiltered: { default: null as GPUTexture | null, transient: true },
        _iblBrdfLut:     { default: null as GPUTexture | null, transient: true },
    },
    systems: {
        pbrIblInit: {
            schedule: { during: ["preRender"] },
            create: db => {
                let started = false;
                return () => {
                    if (started) return;
                    const { device, light } = db.store.resources;
                    if (!device) return;
                    started = true;
                    const assign = (hdr?: Awaited<ReturnType<typeof parseHdr>>): void => {
                        const r = buildIblResources(device, { prefilteredMipCount: PREFILTERED_MIP_COUNT, hdrSource: hdr });
                        db.store.resources._iblEnvironment = r.environment;
                        db.store.resources._iblIrradiance = r.irradiance;
                        db.store.resources._iblPrefiltered = r.prefiltered;
                        db.store.resources._iblBrdfLut = r.brdfLut;
                    };
                    const url = light.environmentUrl;
                    if (url) {
                        fetch(url)
                            .then(r => { if (!r.ok) throw new Error(`HDR ${r.status}`); return r.arrayBuffer(); })
                            .then(buf => assign(parseHdr(buf)))
                            .catch(err => { console.warn("[pbrRender] HDR load failed; procedural fallback", err); assign(); });
                    } else {
                        assign();
                    }
                };
            },
        },
        pbrRenderSystem: {
            schedule: { during: ["render"], after: ["pbrIblInit"] },
            create: db => {
                let pipeline: GPURenderPipeline | null = null;
                let sceneLayout: GPUBindGroupLayout | null = null;
                let iblLayout: GPUBindGroupLayout | null = null;
                let instanceLayout: GPUBindGroupLayout | null = null;
                let iblSampler: GPUSampler | null = null;
                let sceneBindGroup: GPUBindGroup | null = null;
                let iblBindGroup: GPUBindGroup | null = null;
                let cachedSceneBuffer: GPUBuffer | null = null;
                let cachedIrradiance: GPUTexture | null = null;

                // material entity → layer (rebuilt only when the material count changes)
                let matLayer = new Map<Entity, number>();
                let matCount = -1;

                interface Inst { buffer: GPUBuffer; layerBuffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number }
                const instCache = new Map<Entity, Inst>();
                let matScratch = new Float32Array(16);
                let layerScratch = new Uint32Array(1);

                return () => {
                    const {
                        device, renderPassEncoder, canvasFormat, depthFormat, _sceneUniformsBuffer,
                        _materialBindGroup, _iblIrradiance, _iblPrefiltered, _iblBrdfLut,
                    } = db.store.resources;
                    if (!device || !renderPassEncoder || !_sceneUniformsBuffer || !_materialBindGroup) return;
                    if (!_iblIrradiance || !_iblPrefiltered || !_iblBrdfLut) return;

                    if (!sceneLayout) sceneLayout = SceneUniforms.createBindGroupLayout(device);
                    if (!iblLayout) iblLayout = createIblBindGroupLayout(device);
                    if (!instanceLayout) instanceLayout = device.createBindGroupLayout({
                        entries: [
                            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                            { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
                        ],
                    });
                    if (!iblSampler) iblSampler = device.createSampler({
                        magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
                        addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", addressModeW: "clamp-to-edge",
                    });
                    if (!pipeline) {
                        const module = device.createShaderModule({ code: buildPbrArrayShader({ prefilteredMipCount: PREFILTERED_MIP_COUNT }) });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({ bindGroupLayouts: [sceneLayout, createMaterialBindGroupLayout(device), iblLayout, instanceLayout] }),
                            vertex: { module, entryPoint: "vs_main", buffers: [StandardVertex.layout] },
                            fragment: { module, entryPoint: "fs_main", targets: [{ format: canvasFormat }] },
                            primitive: { topology: "triangle-list", cullMode: "back" },
                            depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "less" },
                        });
                    }

                    if (_sceneUniformsBuffer !== cachedSceneBuffer || !sceneBindGroup) {
                        sceneBindGroup = device.createBindGroup({ layout: sceneLayout, entries: [{ binding: 0, resource: { buffer: _sceneUniformsBuffer } }] });
                        cachedSceneBuffer = _sceneUniformsBuffer;
                    }
                    if (_iblIrradiance !== cachedIrradiance || !iblBindGroup) {
                        iblBindGroup = device.createBindGroup({
                            layout: iblLayout,
                            entries: [
                                { binding: 0, resource: _iblIrradiance.createView({ dimension: "cube" }) },
                                { binding: 1, resource: _iblPrefiltered.createView({ dimension: "cube" }) },
                                { binding: 2, resource: _iblBrdfLut.createView() },
                                { binding: 3, resource: iblSampler },
                            ],
                        });
                        cachedIrradiance = _iblIrradiance;
                    }

                    // material → layer, refreshed only when the material set grows
                    let mc = 0;
                    for (const arch of db.store.queryArchetypes(["_layerIndex"])) mc += arch.rowCount;
                    if (mc !== matCount) {
                        matLayer = new Map();
                        for (const arch of db.store.queryArchetypes(["_layerIndex"])) {
                            const id = arch.columns.id, li = arch.columns._layerIndex;
                            for (let i = 0; i < arch.rowCount; i++) matLayer.set(id.get(i), li.get(i));
                        }
                        matCount = mc;
                    }

                    // gather visible drawables grouped by geometry
                    interface Draw { matrix: Mat4x4; layer: number }
                    const byGeo = new Map<Entity, Draw[]>();
                    for (const arch of db.store.queryArchetypes(DRAWABLE)) {
                        const geo = arch.columns.geometry, vis = arch.columns.visible;
                        const pos = arch.columns.position, rot = arch.columns.rotation, scl = arch.columns.scale, mat = arch.columns.material;
                        for (let i = 0; i < arch.rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const layer = matLayer.get(mat.get(i));
                            if (layer === undefined) continue;
                            const g = geo.get(i);
                            let arr = byGeo.get(g);
                            if (!arr) { arr = []; byGeo.set(g, arr); }
                            arr.push({ matrix: trs(pos.get(i), rot.get(i), scl.get(i)), layer });
                        }
                    }
                    if (byGeo.size === 0) return;

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(1, _materialBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

                    for (const arch of db.store.queryArchetypes(PRIMITIVE)) {
                        const vbs = arch.columns._vertexBuffer, ibs = arch.columns._indexBuffer;
                        const counts = arch.columns._indexCount, formats = arch.columns._indexFormat;
                        const geoRefs = arch.columns._geometry, nodeMats = arch.columns._nodeLocalMatrix, primIds = arch.columns.id;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const draws = byGeo.get(geoRefs.get(i));
                            if (!draws) continue;
                            const n = draws.length;
                            const primId = primIds.get(i);

                            let entry = instCache.get(primId);
                            if (!entry || entry.capacity < n) {
                                entry?.buffer.destroy();
                                entry?.layerBuffer.destroy();
                                const buffer = device.createBuffer({ size: Math.max(n * 64, 64), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                                const layerBuffer = device.createBuffer({ size: Math.max(n * 4, 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                                const bindGroup = device.createBindGroup({
                                    layout: instanceLayout,
                                    entries: [{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: layerBuffer } }],
                                });
                                entry = { buffer, layerBuffer, bindGroup, capacity: n };
                                instCache.set(primId, entry);
                            }
                            if (matScratch.length < n * 16) matScratch = new Float32Array(n * 16);
                            if (layerScratch.length < n) layerScratch = new Uint32Array(n);
                            const nodeMatrix = nodeMats.get(i);
                            for (let j = 0; j < n; j++) {
                                matScratch.set(Mat4x4.multiply(draws[j].matrix, nodeMatrix), j * 16);
                                layerScratch[j] = draws[j].layer;
                            }
                            device.queue.writeBuffer(entry.buffer, 0, matScratch, 0, n * 16);
                            device.queue.writeBuffer(entry.layerBuffer, 0, layerScratch, 0, n);

                            renderPassEncoder.setBindGroup(3, entry.bindGroup);
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i)!); // _PbrPrimitive guarantees non-null
                            renderPassEncoder.setIndexBuffer(ibs.get(i)!, formats.get(i)); // _PbrPrimitive guarantees non-null
                            renderPassEncoder.drawIndexed(counts.get(i), n);
                        }
                    }
                };
            },
        },
    },
});
