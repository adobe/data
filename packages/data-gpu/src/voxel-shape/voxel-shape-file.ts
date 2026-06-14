// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createTypedBuffer } from "@adobe/data/typed-buffer";
import { booleanStorageByteLength, booleanWordCount } from "@adobe/data/typed-buffer";
import { Boolean } from "@adobe/data/schema";
import type { Vec3 } from "@adobe/data/math";
import { DenseVolume } from "@adobe/data/volume";
import type { DenseVolume as DenseVolumeType } from "@adobe/data/volume";

/** World units per grid cell along each axis (normative for authored span). */
export const VOXEL_CELL_EXTENT = 0.5;

export interface VoxelShapeFile {
    version: 1;
    size: [number, number, number];
    words: number[];
}

export const authoredSpan = (size: Vec3): Vec3 => [
    size[0] * VOXEL_CELL_EXTENT,
    size[1] * VOXEL_CELL_EXTENT,
    size[2] * VOXEL_CELL_EXTENT,
];

const isVec3 = (value: unknown): value is [number, number, number] =>
    Array.isArray(value)
    && value.length === 3
    && value.every(n => typeof n === "number" && Number.isInteger(n) && n > 0);

const parseWord = (value: unknown, index: number): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 0xFFFF_FFFF) {
        throw new Error(`words[${index}] must be a u32 number (0 … 4294967295)`);
    }
    return value >>> 0;
};

/** Parse on-disk JSON into a boolean dense volume. */
export const parseVoxelShapeFile = (json: unknown): DenseVolumeType<boolean> => {
    if (json == null || typeof json !== "object") {
        throw new Error("Voxel shape file must be a JSON object");
    }
    const file = json as Partial<VoxelShapeFile>;
    if (file.version !== 1) {
        throw new Error(`Unsupported voxel shape version: ${String(file.version)}`);
    }
    if (!isVec3(file.size)) {
        throw new Error("size must be [width, height, depth] with positive integers");
    }
    if (!Array.isArray(file.words)) {
        throw new Error("words must be a number[] of u32 bit-packed occupancy");
    }

    const [width, height, depth] = file.size;
    const cellCount = width * height * depth;
    const expectedWords = booleanWordCount(cellCount);
    if (file.words.length !== expectedWords) {
        throw new Error(
            `words length must be ${expectedWords} for size ${width}x${height}x${depth}, got ${file.words.length}`,
        );
    }

    const words = new Uint32Array(expectedWords);
    for (let i = 0; i < expectedWords; i++) {
        words[i] = parseWord(file.words[i], i);
    }

    const usedBits = cellCount;
    const trailingBits = expectedWords * 32 - usedBits;
    if (trailingBits > 0) {
        const mask = (1 << trailingBits) - 1;
        const last = words[expectedWords - 1]!;
        if ((last & ~mask) !== 0) {
            throw new Error("unused high bits in the last words entry must be zero");
        }
    }

    const data = createTypedBuffer(Boolean.schema, cellCount);
    const dst = data.getTypedArray() as Uint32Array;
    dst.set(words);

    return DenseVolume.create({ size: file.size, data });
};

/** Serialize a boolean dense volume to on-disk JSON (decimal u32 words). */
export const serializeVoxelShapeFile = (volume: DenseVolumeType<boolean>): VoxelShapeFile => {
    const [width, height, depth] = volume.size;
    const cellCount = width * height * depth;
    const wordCount = booleanWordCount(cellCount);
    const src = volume.data.getTypedArray() as Uint32Array;
    const words = Array.from({ length: wordCount }, (_, i) => src[i]! >>> 0);
    return {
        version: 1,
        size: [width, height, depth],
        words,
    };
};
