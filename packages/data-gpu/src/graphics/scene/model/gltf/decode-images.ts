// © 2026 Adobe. MIT License. See /LICENSE for details.

import { readImageBytes } from "./accessor-view.js";
import type { GltfAsset } from "./gltf-schema.js";

/**
 * Categorizes each image index as either "color" (sRGB) or "data" (linear).
 * glTF spec: baseColor and emissive textures are in sRGB color space; normal,
 * metallic-roughness, and occlusion textures are in linear color space.
 *
 * When an image is referenced from both kinds of slot, "color" wins because
 * losing precision in a data texture is more visible than gamma drift in a
 * color one.
 */
function categorizeImages(gltf: GltfAsset): ("color" | "data")[] {
    const out: ("color" | "data")[] = new Array((gltf.images ?? []).length).fill("data");

    const markColor = (textureIndex: number | undefined): void => {
        if (textureIndex === undefined) return;
        const t = gltf.textures?.[textureIndex];
        if (t?.source !== undefined) out[t.source] = "color";
    };

    for (const mat of gltf.materials ?? []) {
        markColor(mat.pbrMetallicRoughness?.baseColorTexture?.index);
        markColor(mat.emissiveTexture?.index);
    }

    return out;
}

async function decodeOne(
    device: GPUDevice,
    bytes: Uint8Array<ArrayBuffer>,
    mimeType: string | undefined,
    colorSpace: "color" | "data",
): Promise<GPUTexture> {
    const blob = new Blob([bytes], { type: mimeType ?? "image/png" });
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none" });
    const format: GPUTextureFormat = colorSpace === "color" ? "rgba8unorm-srgb" : "rgba8unorm";
    const texture = device.createTexture({
        size: [bitmap.width, bitmap.height, 1],
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        [bitmap.width, bitmap.height, 1],
    );
    bitmap.close();
    return texture;
}

export async function decodeAllImages(
    device: GPUDevice,
    gltf: GltfAsset,
    bin: ArrayBuffer,
): Promise<GPUTexture[]> {
    const kinds = categorizeImages(gltf);
    return Promise.all(
        (gltf.images ?? []).map((image, idx) => {
            const bytes = readImageBytes(gltf, bin, idx);
            return decodeOne(device, bytes, image.mimeType, kinds[idx]);
        }),
    );
}

/**
 * Creates 1x1 fallback textures that the renderer can bind when a material
 * doesn't supply a particular slot. Avoids "if texture exists" branches in
 * the shader.
 */
export function createFallbackTextures(device: GPUDevice): {
    white: GPUTextureView;
    black: GPUTextureView;
    flatNormal: GPUTextureView;
} {
    const make = (pixel: Uint8Array<ArrayBuffer>, format: GPUTextureFormat): GPUTextureView => {
        const tex = device.createTexture({
            size: [1, 1, 1],
            format,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture({ texture: tex }, pixel, { bytesPerRow: 4 }, [1, 1, 1]);
        return tex.createView();
    };
    return {
        white: make(new Uint8Array([255, 255, 255, 255]), "rgba8unorm-srgb"),
        black: make(new Uint8Array([0, 0, 0, 255]), "rgba8unorm-srgb"),
        flatNormal: make(new Uint8Array([128, 128, 255, 255]), "rgba8unorm"),
    };
}
