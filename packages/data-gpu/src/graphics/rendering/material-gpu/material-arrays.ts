// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The shared GPU material set: five `texture_2d_array`s (one per PBR map) plus
 * a palette storage buffer of per-layer factors. Every material occupies one
 * layer across all five arrays; a drawable selects its material with a single
 * per-instance layer index. Built once and grown by layer — materials are
 * added rarely and edited never, so nothing here is rebuilt per frame.
 */
export interface MaterialArrays {
    baseColor: GPUTexture;          // rgba8unorm-srgb
    metallicRoughness: GPUTexture;  // rgba8unorm (G = roughness, B = metalness)
    normal: GPUTexture;             // rgba8unorm
    occlusion: GPUTexture;          // rgba8unorm (R = AO)
    emissive: GPUTexture;           // rgba8unorm-srgb
}

/** Fixed layer size every material map is resampled to. */
export const MATERIAL_TEXTURE_SIZE = 512;
/** Maximum distinct materials (array layers). 16 × 512² × 5 maps ≈ 80 MB. */
export const MAX_MATERIAL_LAYERS = 16;
/** Bytes per palette entry: baseColor(vec4) + emissive/metallic(vec4) + rough/normal/occlusion(vec4). */
export const PALETTE_STRIDE = 48;

export function createMaterialArrays(device: GPUDevice): MaterialArrays {
    const make = (format: GPUTextureFormat): GPUTexture =>
        device.createTexture({
            size: [MATERIAL_TEXTURE_SIZE, MATERIAL_TEXTURE_SIZE, MAX_MATERIAL_LAYERS],
            dimension: "2d",
            format,
            // RENDER_ATTACHMENT is required by copyExternalImageToTexture.
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
    return {
        baseColor:         make("rgba8unorm-srgb"),
        metallicRoughness: make("rgba8unorm"),
        normal:            make("rgba8unorm"),
        occlusion:         make("rgba8unorm"),
        emissive:          make("rgba8unorm-srgb"),
    };
}

/** Per-material visible factors written into one palette layer. */
export interface MaterialFactors {
    baseColorFactor: readonly number[];
    emissiveFactor: readonly number[];
    metallicFactor: number;
    roughnessFactor: number;
    normalScale: number;
    occlusionStrength: number;
}

const _palette = new Float32Array(PALETTE_STRIDE / 4);

export function writePaletteLayer(device: GPUDevice, palette: GPUBuffer, layer: number, f: MaterialFactors): void {
    _palette[0] = f.baseColorFactor[0]; _palette[1] = f.baseColorFactor[1]; _palette[2] = f.baseColorFactor[2]; _palette[3] = f.baseColorFactor[3];
    _palette[4] = f.emissiveFactor[0]; _palette[5] = f.emissiveFactor[1]; _palette[6] = f.emissiveFactor[2]; _palette[7] = f.metallicFactor;
    _palette[8] = f.roughnessFactor; _palette[9] = f.normalScale; _palette[10] = f.occlusionStrength; _palette[11] = 0;
    device.queue.writeBuffer(palette, layer * PALETTE_STRIDE, _palette);
}

/** The five map source URLs for one material ("" = leave the neutral layer). */
export interface MaterialMapUrls {
    baseColorUrl: string;
    metallicRoughnessUrl: string;
    normalUrl: string;
    occlusionUrl: string;
    emissiveUrl: string;
}

/**
 * Fetches a material's maps and blits them (resampled to the layer size) into
 * its array layer. Fire-and-forget: each map resolves independently, so a body
 * renders (neutral) immediately and sharpens as textures arrive. URLs shared
 * across maps (e.g. an ARM image used for both metallicRoughness and occlusion)
 * are fetched once and copied to each target.
 */
export function loadMaterialMaps(device: GPUDevice, arrays: MaterialArrays, layer: number, urls: MaterialMapUrls): void {
    const targets: { url: string; tex: GPUTexture }[] = [
        { url: urls.baseColorUrl,         tex: arrays.baseColor },
        { url: urls.metallicRoughnessUrl, tex: arrays.metallicRoughness },
        { url: urls.normalUrl,            tex: arrays.normal },
        { url: urls.occlusionUrl,         tex: arrays.occlusion },
        { url: urls.emissiveUrl,          tex: arrays.emissive },
    ];
    const byUrl = new Map<string, GPUTexture[]>();
    for (const t of targets) {
        if (!t.url) continue;
        const list = byUrl.get(t.url);
        if (list) list.push(t.tex);
        else byUrl.set(t.url, [t.tex]);
    }
    for (const [url, texes] of byUrl) {
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`material map ${r.status}: ${url}`); return r.blob(); })
            .then(blob => createImageBitmap(blob, {
                resizeWidth: MATERIAL_TEXTURE_SIZE,
                resizeHeight: MATERIAL_TEXTURE_SIZE,
                colorSpaceConversion: "none",
            }))
            .then(bitmap => {
                for (const tex of texes) {
                    device.queue.copyExternalImageToTexture(
                        { source: bitmap },
                        { texture: tex, origin: [0, 0, layer] },
                        [MATERIAL_TEXTURE_SIZE, MATERIAL_TEXTURE_SIZE, 1],
                    );
                }
                bitmap.close();
            })
            .catch(err => console.warn("[materialGpu] map load failed", err));
    }
}
