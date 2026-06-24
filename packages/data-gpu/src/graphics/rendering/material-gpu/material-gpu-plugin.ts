// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { U32 } from "@adobe/data/math";
import { core } from "../../../core/core-plugin.js";
import { Material } from "../../../material/material.js";
import {
    type MaterialArrays,
    MAX_MATERIAL_LAYERS, PALETTE_STRIDE,
    createMaterialArrays, writePaletteLayer, loadMaterialMaps,
} from "./material-arrays.js";
import { createMaterialBindGroup } from "./material-bind-group.js";

/** Material rows the builder reads to fill a layer (factors + map URLs). */
const MATERIAL_COMPONENTS = [
    "baseColorFactor", "emissiveFactor", "metallicFactor", "roughnessFactor", "normalScale", "occlusionStrength",
    "baseColorUrl", "metallicRoughnessUrl", "normalUrl", "occlusionUrl", "emissiveUrl",
] as const;

/**
 * materialGpu — derives the shared GPU material set from the `Material`
 * registry. Each authored material is assigned one array layer; its factors go
 * into the palette buffer and its maps are fetched + blitted into that layer.
 *
 * Incremental and cached: the arrays / palette / bind group are built once, and
 * a layer is assigned only to a material that doesn't have one yet (`_layerIndex`
 * excluded). Materials are added rarely and edited never, so steady state does
 * no work. The renderer (P3) binds `_materialBindGroup` once and selects a
 * material per instance by `_layerIndex`.
 */
export const materialGpu = Database.Plugin.create({
    extends: Database.Plugin.combine(Material.plugin, core),
    components: {
        _layerIndex: U32.schema,
    },
    resources: {
        _materialArrays:    { default: null as MaterialArrays | null, transient: true },
        _materialPalette:   { default: null as GPUBuffer | null, transient: true },
        _materialBindGroup: { default: null as GPUBindGroup | null, transient: true },
    },
    systems: {
        materialGpuBuilder: {
            schedule: { during: ["preRender"] },
            create: db => {
                let arrays: MaterialArrays | null = null;
                let palette: GPUBuffer | null = null;
                let nextLayer = 0;
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;

                    // Assign a layer to each material that lacks one. Tail→head:
                    // every visited row migrates out (gains _layerIndex), so the
                    // removal is always from the tail — no hole-fill shift. The GPU
                    // arrays are created lazily on the first material, so glTF-only
                    // scenes (no materials) allocate nothing.
                    for (const arch of db.store.queryArchetypes(["name", ...MATERIAL_COMPONENTS], { exclude: ["_layerIndex"] })) {
                        const c = arch.columns;
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            if (nextLayer >= MAX_MATERIAL_LAYERS) break;
                            if (!arrays || !palette) {
                                arrays = createMaterialArrays(device);
                                palette = device.createBuffer({
                                    size: MAX_MATERIAL_LAYERS * PALETTE_STRIDE,
                                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                                });
                                db.store.resources._materialArrays = arrays;
                                db.store.resources._materialPalette = palette;
                                db.store.resources._materialBindGroup = createMaterialBindGroup(device, arrays, palette);
                            }
                            const id = c.id.get(i);
                            const layer = nextLayer++;
                            writePaletteLayer(device, palette, layer, {
                                baseColorFactor: c.baseColorFactor.get(i),
                                emissiveFactor: c.emissiveFactor.get(i),
                                metallicFactor: c.metallicFactor.get(i),
                                roughnessFactor: c.roughnessFactor.get(i),
                                normalScale: c.normalScale.get(i),
                                occlusionStrength: c.occlusionStrength.get(i),
                            });
                            loadMaterialMaps(device, arrays, layer, {
                                baseColorUrl: c.baseColorUrl.get(i),
                                metallicRoughnessUrl: c.metallicRoughnessUrl.get(i),
                                normalUrl: c.normalUrl.get(i),
                                occlusionUrl: c.occlusionUrl.get(i),
                                emissiveUrl: c.emissiveUrl.get(i),
                            });
                            db.store.update(id, { _layerIndex: layer });
                        }
                    }
                };
            },
        },
    },
});
