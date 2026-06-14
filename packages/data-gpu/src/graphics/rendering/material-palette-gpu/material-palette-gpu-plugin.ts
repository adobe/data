// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { U32 } from "@adobe/data/math";
import { core } from "../../../core/core-plugin.js";
import { Material } from "../../../material/material.js";
import {
    MAX_FACTOR_PALETTE_ENTRIES,
    PALETTE_STRIDE,
    materialHasMaps,
    writePaletteLayer,
} from "./material-palette.js";
import { createFactorPaletteBindGroup } from "./palette-bind-group.js";

/** Material rows the factor builder reads (PBR factors only — no map URLs). */
const FACTOR_MATERIAL_COMPONENTS = [
    "baseColorFactor", "emissiveFactor", "metallicFactor", "roughnessFactor", "normalScale", "occlusionStrength",
    "irEmission", "emissionMode",
    "baseColorUrl", "metallicRoughnessUrl", "normalUrl", "occlusionUrl", "emissiveUrl",
] as const;

/**
 * materialPaletteGpu — uploads factor-only materials into a shared palette buffer.
 * Materials with any map URL are skipped (no map upload path — use factor rows or glTF).
 * Each factor material gets `_paletteIndex`; no texture arrays are allocated.
 */
export const materialPaletteGpu = Database.Plugin.create({
    extends: Database.Plugin.combine(Material.plugin, core),
    components: {
        _paletteIndex: U32.schema,
    },
    resources: {
        _factorPalette: { default: null as GPUBuffer | null, transient: true },
        _factorPaletteBindGroup: { default: null as GPUBindGroup | null, transient: true },
    },
    systems: {
        materialPaletteGpuBuilder: {
            schedule: { during: ["preRender"] },
            create: db => {
                let palette: GPUBuffer | null = null;
                let nextIndex = 0;
                return () => {
                    const { device } = db.store.resources;
                    if (!device) return;

                    for (const arch of db.store.queryArchetypes(["name", ...FACTOR_MATERIAL_COMPONENTS], { exclude: ["_paletteIndex"] })) {
                        const c = arch.columns;
                        for (let i = arch.rowCount - 1; i >= 0; i--) {
                            const urls = {
                                baseColorUrl: c.baseColorUrl.get(i),
                                metallicRoughnessUrl: c.metallicRoughnessUrl.get(i),
                                normalUrl: c.normalUrl.get(i),
                                occlusionUrl: c.occlusionUrl.get(i),
                                emissiveUrl: c.emissiveUrl.get(i),
                            };
                            if (materialHasMaps(urls)) continue;
                            if (nextIndex >= MAX_FACTOR_PALETTE_ENTRIES) break;

                            if (!palette) {
                                palette = device.createBuffer({
                                    size: MAX_FACTOR_PALETTE_ENTRIES * PALETTE_STRIDE,
                                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                                });
                                db.store.resources._factorPalette = palette;
                                db.store.resources._factorPaletteBindGroup = createFactorPaletteBindGroup(device, palette);
                            }

                            const index = nextIndex++;
                            writePaletteLayer(device, palette, index, {
                                baseColorFactor: c.baseColorFactor.get(i),
                                emissiveFactor: c.emissiveFactor.get(i),
                                metallicFactor: c.metallicFactor.get(i),
                                roughnessFactor: c.roughnessFactor.get(i),
                                normalScale: c.normalScale.get(i),
                                occlusionStrength: c.occlusionStrength.get(i),
                                irEmission: c.irEmission.get(i),
                                emissionMode: c.emissionMode.get(i),
                            });
                            db.store.update(c.id.get(i), { _paletteIndex: index });
                        }
                    }
                };
            },
        },
    },
});
