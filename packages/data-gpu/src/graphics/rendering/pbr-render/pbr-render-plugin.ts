// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { pbrIblRender } from "../ibl-render/ibl-render-plugin.js";
import { materialGpu } from "../material-gpu/material-gpu-plugin.js";
import { displayTransform } from "../display-transform-plugin.js";
import { SceneUniforms } from "../../scene/scene-uniforms/scene-uniforms.js";
import { StandardVertex } from "../standard-vertex/standard-vertex.js";
import { createMaterialBindGroupLayout } from "../material-gpu/material-bind-group.js";
import { buildPbrArrayShader } from "./pbr-array-shader.wgsl.js";

// Must match pbrIblRender's bake so the array shader's prefiltered-mip math agrees.
const PREFILTERED_MIP_COUNT = 7;

/** Drawable: any visible entity with a geometry ref, a transform, and a material. */
const DRAWABLE = ["geometry", "visible", "position", "rotation", "scale", "material"] as const;
// Bodies carrying a derived display pose (interpolation-plugin) draw at it instead
// of the canonical pose; everything else (statics, props, non-physics instances)
// draws straight from position/rotation. Splitting the gather by archetype shape
// avoids a per-row "has display pose?" branch.
const DRAWABLE_INTERP = [...DRAWABLE, "_renderPosition", "_renderRotation"] as const;
const DRAWABLE_DIRECT = { exclude: ["_renderPosition"] } as const;
const PRIMITIVE = ["_vertexBuffer", "_indexBuffer", "_indexCount", "_indexFormat", "_geometry", "_nodeLocalMatrix"] as const;

/** Minimal column shape the gather reads — satisfied by either query's columns. */
interface Col<T> { get(i: number): T }

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

/**
 * Compose a column-major TRS matrix directly into `out[o..o+15]` — no
 * allocation, reading position/rotation/scale straight from their column typed
 * arrays. Matches `translation · Quat.toMat4 · scaling`. Runs once per visible
 * drawable per frame, so the array churn of the math-helper form matters.
 */
function composeTrs(
    out: Float32Array, o: number,
    p: ArrayLike<number>, pi: number, q: ArrayLike<number>, qi: number, s: ArrayLike<number>, si: number,
): void {
    const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
    const sx = s[si], sy = s[si + 1], sz = s[si + 2];
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    out[o] = (1 - 2 * (yy + zz)) * sx; out[o + 1] = (2 * (xy + wz)) * sx; out[o + 2] = (2 * (xz - wy)) * sx; out[o + 3] = 0;
    out[o + 4] = (2 * (xy - wz)) * sy; out[o + 5] = (1 - 2 * (xx + zz)) * sy; out[o + 6] = (2 * (yz + wx)) * sy; out[o + 7] = 0;
    out[o + 8] = (2 * (xz + wy)) * sz; out[o + 9] = (2 * (yz - wx)) * sz; out[o + 10] = (1 - 2 * (xx + yy)) * sz; out[o + 11] = 0;
    out[o + 12] = p[pi]; out[o + 13] = p[pi + 1]; out[o + 14] = p[pi + 2]; out[o + 15] = 1;
}

/**
 * pbrRender — the single PBR + IBL renderer. It extends `pbrIblRender`, reusing
 * its IBL bake, skybox, scene/material bind groups and glTF draw path verbatim,
 * and adds one extra draw query for **instanced primitives** whose material
 * comes from the shared `materialGpu` arrays (selected per instance by the
 * material entity's `_layerIndex`). Two efficient queries, one render plugin:
 *
 *   - glTF models  → per-material bind group, native-resolution textures (pbrIblRender)
 *   - primitives   → shared texture_2d_array + per-instance layer (this system)
 *
 * The primitive system runs after `pbrIblRenderSystem` so the skybox is drawn
 * first. World matrices are computed directly from `position`/`rotation`/`scale`
 * (primitives are flat — no hierarchy), so it's independent of `transform`.
 */
export const pbrRender = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, materialGpu, displayTransform),
    systems: {
        pbrPrimitiveRenderSystem: {
            schedule: { during: ["render"], after: ["beginRenderPass", "pbrIblRenderSystem"], before: ["endRenderPass"] },
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

                let matLayer = new Map<Entity, number>();
                let matCount = -1;

                interface Inst { buffer: GPUBuffer; layerBuffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number }
                const instCache = new Map<Entity, Inst>();
                let matScratch = new Float32Array(16);
                let layerScratch = new Uint32Array(1);
                // Per-frame matrix arena (composed TRS, one mat4 per drawable) + per-geometry
                // draw lists (matrix offset + layer). All pooled and reused across frames —
                // the gather runs over every visible body each frame, so zero allocation here.
                let mats = new Float32Array(64 * 16);
                const batches = new Map<Entity, { off: number[]; layer: number[] }>();

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

                    // Gather visible primitive drawables grouped by geometry. Compose each
                    // world matrix straight from the chosen pose/scale column typed arrays
                    // into the pooled `mats` arena — no per-row array allocation. Two passes:
                    // bodies with a display pose use it; everything else uses position/rotation.
                    for (const b of batches.values()) { b.off.length = 0; b.layer.length = 0; }
                    let drawCount = 0;
                    const gather = (
                        rowCount: number, vis: Col<boolean>, geo: Col<Entity>, mat: Col<Entity>,
                        posArr: ArrayLike<number>, rotArr: ArrayLike<number>, sclArr: ArrayLike<number>,
                    ): void => {
                        for (let i = 0; i < rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const layer = matLayer.get(mat.get(i));
                            if (layer === undefined) continue;
                            if ((drawCount + 1) * 16 > mats.length) { const grown = new Float32Array(mats.length * 2); grown.set(mats); mats = grown; }
                            composeTrs(mats, drawCount * 16, posArr, i * 3, rotArr, i * 4, sclArr, i * 3);
                            const g = geo.get(i);
                            let b = batches.get(g);
                            if (!b) { b = { off: [], layer: [] }; batches.set(g, b); }
                            b.off.push(drawCount); b.layer.push(layer);
                            drawCount++;
                        }
                    };
                    for (const arch of db.store.queryArchetypes(DRAWABLE_INTERP)) {
                        gather(arch.rowCount, arch.columns.visible, arch.columns.geometry, arch.columns.material,
                            arch.columns._renderPosition.getTypedArray(), arch.columns._renderRotation.getTypedArray(), arch.columns.scale.getTypedArray());
                    }
                    for (const arch of db.store.queryArchetypes(DRAWABLE, DRAWABLE_DIRECT)) {
                        gather(arch.rowCount, arch.columns.visible, arch.columns.geometry, arch.columns.material,
                            arch.columns.position.getTypedArray(), arch.columns.rotation.getTypedArray(), arch.columns.scale.getTypedArray());
                    }
                    if (drawCount === 0) return;

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(1, _materialBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

                    for (const arch of db.store.queryArchetypes(PRIMITIVE)) {
                        const vbs = arch.columns._vertexBuffer, ibs = arch.columns._indexBuffer;
                        const counts = arch.columns._indexCount, formats = arch.columns._indexFormat;
                        const geoRefs = arch.columns._geometry, primIds = arch.columns.id;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const b = batches.get(geoRefs.get(i));
                            if (!b || b.off.length === 0) continue;
                            const n = b.off.length;
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
                            // Copy this geometry's matrices out of the arena into a contiguous
                            // upload buffer. Primitive node matrices are identity (flat shapes;
                            // glTF hierarchy goes through pbrIblRender), so no extra multiply.
                            for (let j = 0; j < n; j++) {
                                const src = b.off[j] * 16, dst = j * 16;
                                for (let k = 0; k < 16; k++) matScratch[dst + k] = mats[src + k];
                                layerScratch[j] = b.layer[j];
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
