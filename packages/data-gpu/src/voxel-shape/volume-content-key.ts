// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { DenseVolume } from "@adobe/data/volume";
import { booleanStorageByteLength } from "@adobe/data/typed-buffer";

/** Stable cache key from voxel grid size and packed occupancy bits. */
export const volumeContentKey = (volume: DenseVolume<boolean>): string => {
    const [w, h, d] = volume.size;
    const cellCount = w * h * d;
    const bytes = booleanStorageByteLength(cellCount);
    const words = volume.data.getTypedArray() as Uint32Array;
    const view = new Uint8Array(words.buffer, words.byteOffset, bytes);
    let hex = "";
    for (let i = 0; i < view.length; i++) {
        hex += view[i]!.toString(16).padStart(2, "0");
    }
    return `${w}x${h}x${d}:${hex}`;
};
