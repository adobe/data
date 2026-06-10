// © 2026 Adobe. MIT License. See /LICENSE for details.

import {
    ACCESSOR_TYPE_COMPONENTS,
    COMPONENT_TYPE,
    type GltfAccessor,
    type GltfAsset,
} from "./gltf-schema.js";

/**
 * Returns a typed-array view over the buffer slice referenced by an accessor.
 * Assumes tightly packed data (no byteStride). For interleaved attributes a
 * different reader would be needed — glTF primitives commonly use separate buffer
 * views per attribute so this is sufficient for the standard case.
 */
export function readAccessor(
    gltf: GltfAsset,
    bin: ArrayBuffer,
    accessorIndex: number,
): Float32Array | Uint16Array | Uint32Array | Uint8Array {
    const accessor = gltf.accessors?.[accessorIndex];
    if (!accessor) throw new Error(`Accessor ${accessorIndex} not found`);
    const bv = gltf.bufferViews?.[accessor.bufferView ?? -1];
    if (!bv) throw new Error(`BufferView for accessor ${accessorIndex} not found`);

    const componentCount = ACCESSOR_TYPE_COMPONENTS[accessor.type];
    const totalElements = accessor.count * componentCount;
    const offset = (bv.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

    switch (accessor.componentType) {
        case COMPONENT_TYPE.FLOAT:
            return new Float32Array(bin, offset, totalElements);
        case COMPONENT_TYPE.UNSIGNED_SHORT:
            return new Uint16Array(bin, offset, totalElements);
        case COMPONENT_TYPE.UNSIGNED_INT:
            return new Uint32Array(bin, offset, totalElements);
        case COMPONENT_TYPE.UNSIGNED_BYTE:
            return new Uint8Array(bin, offset, totalElements);
        default:
            throw new Error(`Unsupported componentType ${accessor.componentType}`);
    }
}

export function readImageBytes(gltf: GltfAsset, bin: ArrayBuffer, imageIndex: number): Uint8Array {
    const image = gltf.images?.[imageIndex];
    if (!image) throw new Error(`Image ${imageIndex} not found`);
    if (image.bufferView === undefined) {
        throw new Error(`Image ${imageIndex} has no bufferView (external URIs not supported)`);
    }
    const bv = gltf.bufferViews?.[image.bufferView];
    if (!bv) throw new Error(`BufferView for image ${imageIndex} not found`);
    return new Uint8Array(bin, bv.byteOffset ?? 0, bv.byteLength);
}
