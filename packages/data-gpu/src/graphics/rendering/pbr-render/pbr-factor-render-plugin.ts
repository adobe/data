// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, type Entity } from "@adobe/data/ecs";
import { pbrIblRender } from "../ibl-render/ibl-render-plugin.js";
import { materialPaletteGpu } from "../material-palette-gpu/material-palette-gpu-plugin.js";
import { displayTransform } from "../display-transform-plugin.js";
import { SceneUniforms } from "../../scene/scene-uniforms/scene-uniforms.js";
import { StandardVertex } from "../standard-vertex/standard-vertex.js";
import { createFactorPaletteBindGroupLayout } from "../material-palette-gpu/palette-bind-group.js";
import { buildPbrFactorShader } from "./pbr-factor-shader.wgsl.js";
import {
    composeTrs,
    createIblBindGroupLayout,
    DRAWABLE,
    DRAWABLE_DIRECT,
    DRAWABLE_INTERP,
    PREFILTERED_MIP_COUNT,
    PRIMITIVE,
    type ColumnReader,
    type MeshBatch,
} from "./primitive-render-shared.js";

interface InstCache { buffer: GPUBuffer; indexBuffer: GPUBuffer; bindGroup: GPUBindGroup; capacity: number }

/**
 * pbrFactorRender — instanced primitive PBR from material factors only (no map
 * sampling). Extends `pbrIblRender` for IBL + skybox + optional glTF draws.
 * Pairs with `materialPaletteGpu` (`_paletteIndex` on factor materials).
 *
 * Pairs with `materialPaletteGpu` (`_paletteIndex`). Idle when no factor materials or drawables exist.
 */
export const pbrFactorRender = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, materialPaletteGpu, displayTransform),
    systems: {
        pbrFactorPrimitiveRenderSystem: {
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

                const matIndex = new Map<Entity, number>();
                let matCount = -1;

                const instCache = new Map<Entity, InstCache>();
                let matScratch = new Float32Array(16);
                let indexScratch = new Uint32Array(1);
                let mats = new Float32Array(64 * 16);
                const batches = new Map<Entity, MeshBatch>();

                return () => {
                    const {
                        device, renderPassEncoder, canvasFormat, depthFormat, _sceneUniformsBuffer,
                        _factorPaletteBindGroup, _iblIrradiance, _iblPrefiltered, _iblBrdfLut,
                    } = db.store.resources;
                    if (!device || !renderPassEncoder || !_sceneUniformsBuffer || !_factorPaletteBindGroup) return;
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
                        const module = device.createShaderModule({ code: buildPbrFactorShader({ prefilteredMipCount: PREFILTERED_MIP_COUNT }) });
                        pipeline = device.createRenderPipeline({
                            layout: device.createPipelineLayout({
                                bindGroupLayouts: [sceneLayout, createFactorPaletteBindGroupLayout(device), iblLayout, instanceLayout],
                            }),
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

                    let mc = 0;
                    for (const arch of db.store.queryArchetypes(["_paletteIndex"])) mc += arch.rowCount;
                    if (mc !== matCount) {
                        matIndex.clear();
                        for (const arch of db.store.queryArchetypes(["_paletteIndex"])) {
                            const id = arch.columns.id, pi = arch.columns._paletteIndex;
                            for (let i = 0; i < arch.rowCount; i++) matIndex.set(id.get(i), pi.get(i));
                        }
                        matCount = mc;
                    }

                    for (const b of batches.values()) { b.off.length = 0; b.materialIndex.length = 0; }
                    let drawCount = 0;
                    const gather = (
                        rowCount: number, vis: ColumnReader<boolean>, meshCol: ColumnReader<Entity>, mat: ColumnReader<Entity>,
                        posArr: ArrayLike<number>, rotArr: ArrayLike<number>, sclArr: ArrayLike<number>,
                    ): void => {
                        for (let i = 0; i < rowCount; i++) {
                            if (!vis.get(i)) continue;
                            const paletteIndex = matIndex.get(mat.get(i));
                            if (paletteIndex === undefined) continue;
                            if ((drawCount + 1) * 16 > mats.length) { const grown = new Float32Array(mats.length * 2); grown.set(mats); mats = grown; }
                            composeTrs(mats, drawCount * 16, posArr, i * 3, rotArr, i * 4, sclArr, i * 3);
                            const g = meshCol.get(i);
                            let b = batches.get(g);
                            if (!b) { b = { off: [], materialIndex: [] }; batches.set(g, b); }
                            b.off.push(drawCount);
                            b.materialIndex.push(paletteIndex);
                            drawCount++;
                        }
                    };
                    for (const arch of db.store.queryArchetypes(DRAWABLE_INTERP)) {
                        gather(arch.rowCount, arch.columns.visible, arch.columns.mesh, arch.columns.material,
                            arch.columns._renderPosition.getTypedArray(), arch.columns._renderRotation.getTypedArray(), arch.columns.scale.getTypedArray());
                    }
                    for (const arch of db.store.queryArchetypes(DRAWABLE, DRAWABLE_DIRECT)) {
                        gather(arch.rowCount, arch.columns.visible, arch.columns.mesh, arch.columns.material,
                            arch.columns.position.getTypedArray(), arch.columns.rotation.getTypedArray(), arch.columns.scale.getTypedArray());
                    }
                    if (drawCount === 0) return;

                    renderPassEncoder.setPipeline(pipeline);
                    renderPassEncoder.setBindGroup(0, sceneBindGroup);
                    renderPassEncoder.setBindGroup(1, _factorPaletteBindGroup);
                    renderPassEncoder.setBindGroup(2, iblBindGroup);

                    for (const arch of db.store.queryArchetypes(PRIMITIVE)) {
                        const vbs = arch.columns._vertexBuffer, ibs = arch.columns._indexBuffer;
                        const counts = arch.columns._indexCount, formats = arch.columns._indexFormat;
                        const meshRefs = arch.columns._mesh, primIds = arch.columns.id;
                        for (let i = 0; i < arch.rowCount; i++) {
                            const b = batches.get(meshRefs.get(i));
                            if (!b || b.off.length === 0) continue;
                            const n = b.off.length;
                            const primId = primIds.get(i);

                            let entry = instCache.get(primId);
                            if (!entry || entry.capacity < n) {
                                entry?.buffer.destroy();
                                entry?.indexBuffer.destroy();
                                const buffer = device.createBuffer({ size: Math.max(n * 64, 64), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                                const indexBuffer = device.createBuffer({ size: Math.max(n * 4, 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
                                const bindGroup = device.createBindGroup({
                                    layout: instanceLayout,
                                    entries: [{ binding: 0, resource: { buffer } }, { binding: 1, resource: { buffer: indexBuffer } }],
                                });
                                entry = { buffer, indexBuffer, bindGroup, capacity: n };
                                instCache.set(primId, entry);
                            }
                            if (matScratch.length < n * 16) matScratch = new Float32Array(n * 16);
                            if (indexScratch.length < n) indexScratch = new Uint32Array(n);
                            for (let j = 0; j < n; j++) {
                                const src = b.off[j] * 16, dst = j * 16;
                                for (let k = 0; k < 16; k++) matScratch[dst + k] = mats[src + k];
                                indexScratch[j] = b.materialIndex[j];
                            }
                            device.queue.writeBuffer(entry.buffer, 0, matScratch, 0, n * 16);
                            device.queue.writeBuffer(entry.indexBuffer, 0, indexScratch, 0, n);

                            renderPassEncoder.setBindGroup(3, entry.bindGroup);
                            renderPassEncoder.setVertexBuffer(0, vbs.get(i)!);
                            renderPassEncoder.setIndexBuffer(ibs.get(i)!, formats.get(i));
                            renderPassEncoder.drawIndexed(counts.get(i), n);
                        }
                    }
                };
            },
        },
    },
});
