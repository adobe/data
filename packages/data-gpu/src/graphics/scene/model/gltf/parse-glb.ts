// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { GltfAsset } from "./gltf-schema.js";

const MAGIC_GLTF = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

export interface ParsedGlb {
    json: GltfAsset;
    bin: ArrayBuffer;
}

export function parseGlb(buffer: ArrayBuffer): ParsedGlb {
    if (buffer.byteLength < 12) {
        throw new Error("GLB too short to contain header");
    }
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    if (magic !== MAGIC_GLTF) {
        throw new Error(`Not a GLB file (magic = 0x${magic.toString(16)})`);
    }
    const version = view.getUint32(4, true);
    if (version !== 2) {
        throw new Error(`Unsupported GLB version ${version}`);
    }

    let offset = 12;
    let json: GltfAsset | null = null;
    let bin: ArrayBuffer | null = null;

    while (offset < buffer.byteLength) {
        const chunkLength = view.getUint32(offset, true);
        const chunkType = view.getUint32(offset + 4, true);
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + chunkLength;

        if (chunkType === CHUNK_JSON) {
            const bytes = new Uint8Array(buffer, chunkStart, chunkLength);
            const text = new TextDecoder().decode(bytes);
            json = JSON.parse(text) as GltfAsset;
        } else if (chunkType === CHUNK_BIN) {
            bin = buffer.slice(chunkStart, chunkEnd);
        }

        offset = chunkEnd;
    }

    if (!json) throw new Error("GLB missing JSON chunk");
    return { json, bin: bin ?? new ArrayBuffer(0) };
}
