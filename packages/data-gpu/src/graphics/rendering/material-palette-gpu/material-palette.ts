// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Bytes per palette entry: 4 × vec4 (base, emissive/metal, rough/normal/occlusion/ir, emission meta). */
export const PALETTE_STRIDE = 64;

/** Factor-only materials — palette rows only, no map memory. */
export const MAX_FACTOR_PALETTE_ENTRIES = 256;

/** Per-material visible factors written into one palette row. */
export interface MaterialFactors {
    baseColorFactor: readonly number[];
    emissiveFactor: readonly number[];
    metallicFactor: number;
    roughnessFactor: number;
    normalScale: number;
    occlusionStrength: number;
    irEmission: number;
    emissionMode: number;
}

const _palette = new Float32Array(PALETTE_STRIDE / 4);

export function writePaletteLayer(device: GPUDevice, palette: GPUBuffer, index: number, f: MaterialFactors): void {
    _palette[0] = f.baseColorFactor[0]; _palette[1] = f.baseColorFactor[1]; _palette[2] = f.baseColorFactor[2]; _palette[3] = f.baseColorFactor[3];
    _palette[4] = f.emissiveFactor[0]; _palette[5] = f.emissiveFactor[1]; _palette[6] = f.emissiveFactor[2]; _palette[7] = f.metallicFactor;
    _palette[8] = f.roughnessFactor; _palette[9] = f.normalScale; _palette[10] = f.occlusionStrength; _palette[11] = f.irEmission;
    _palette[12] = f.emissionMode; _palette[13] = 0; _palette[14] = 0; _palette[15] = 0;
    device.queue.writeBuffer(palette, index * PALETTE_STRIDE, _palette);
}

/** The five map source URLs for one material ("" = factor-only). */
export interface MaterialMapUrls {
    baseColorUrl: string;
    metallicRoughnessUrl: string;
    normalUrl: string;
    occlusionUrl: string;
    emissiveUrl: string;
}

export const materialHasMaps = (urls: MaterialMapUrls): boolean =>
    !!(urls.baseColorUrl || urls.metallicRoughnessUrl || urls.normalUrl || urls.occlusionUrl || urls.emissiveUrl);
