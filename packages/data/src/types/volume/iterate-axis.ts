// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";
import type { TypedBuffer } from "../../typed-buffer/typed-buffer.js";
import type { Callback } from "./callback.js";
import { getDenseIndex, localBlockIndex } from "./volume-index.js";
import { unpackBlockKey } from "./create-sparse-block/unpack-block-key.js";

export type IterateAxis = "x" | "y" | "z";

interface DenseAxisSpec {
    readonly length: number;
    readonly step: number;
    readonly outer: readonly [number, number];
    readonly segmentStart: (size: Vec3, a: number, b: number) => number;
    readonly origin: (a: number, b: number) => readonly [number, number, number];
    readonly isLast: (a: number, b: number, lastA: number, lastB: number) => boolean;
}

const denseAxisSpecs: Record<IterateAxis, (size: Vec3) => DenseAxisSpec> = {
    x: (size) => {
        const [width, height, depth] = size;
        return {
            length: width,
            step: 1,
            outer: [depth, height] as const,
            segmentStart: (s, y, z) => getDenseIndex(s, 0, y, z),
            origin: (y, z) => [0, y, z] as const,
            isLast: (y, z, lastY, lastZ) => y === lastY && z === lastZ,
        };
    },
    y: (size) => {
        const [width, height, depth] = size;
        return {
            length: height,
            step: width,
            outer: [depth, width] as const,
            segmentStart: (s, x, z) => getDenseIndex(s, x, 0, z),
            origin: (x, z) => [x, 0, z] as const,
            isLast: (x, z, lastX, lastZ) => x === lastX && z === lastZ,
        };
    },
    z: (size) => {
        const [width, height, depth] = size;
        const plane = width * height;
        return {
            length: depth,
            step: plane,
            outer: [height, width] as const,
            segmentStart: (s, x, y) => getDenseIndex(s, x, y, 0),
            origin: (x, y) => [x, y, 0] as const,
            isLast: (x, y, lastX, lastY) => x === lastX && y === lastY,
        };
    },
};

export const iterateDenseAxis = <T>(
    size: Vec3,
    data: TypedBuffer<T>,
    callback: Callback<T>,
    axis: IterateAxis,
): void => {
    const [width, height, depth] = size;
    if (width === 0 || height === 0 || depth === 0) {
        return;
    }

    const spec = denseAxisSpecs[axis](size);
    const [outerCount, innerCount] = spec.outer;
    const segments = [0, spec.length];
    const lastOuter = outerCount - 1;
    const lastInner = innerCount - 1;

    for (let outer = 0; outer < outerCount; outer++) {
        for (let inner = 0; inner < innerCount; inner++) {
            segments[0] = spec.segmentStart(size, inner, outer);
            const [x, y, z] = spec.origin(inner, outer);
            callback(
                data,
                segments,
                spec.step,
                x,
                y,
                z,
                spec.isLast(inner, outer, lastInner, lastOuter),
            );
        }
    }
};

interface SparseBlockAxisSpec {
    readonly segmentStart: (blockOffset: number, a: number, b: number, blockSize: number, blockVolume: number) => number;
    readonly origin: (originX: number, originY: number, originZ: number, a: number, b: number) => readonly [number, number, number];
    readonly isLast: (
        blockIndex: number,
        lastBlockIndex: number,
        a: number,
        b: number,
        lastA: number,
        lastB: number,
    ) => boolean;
}

const sparseBlockAxisSpecs: Record<IterateAxis, SparseBlockAxisSpec> = {
    x: {
        segmentStart: (blockOffset, ly, lz, blockSize, blockVolume) =>
            blockOffset + ly * blockSize + lz * blockVolume,
        origin: (originX, originY, originZ, ly, lz) =>
            [originX, originY + ly, originZ + lz] as const,
        isLast: (blockIndex, lastBlockIndex, ly, lz, lastLy, lastLz) =>
            blockIndex === lastBlockIndex && ly === lastLy && lz === lastLz,
    },
    y: {
        segmentStart: (blockOffset, lx, lz, _blockSize, blockVolume) =>
            blockOffset + lx + lz * blockVolume,
        origin: (originX, originY, originZ, lx, lz) =>
            [originX + lx, originY, originZ + lz] as const,
        isLast: (blockIndex, lastBlockIndex, lx, lz, lastLx, lastLz) =>
            blockIndex === lastBlockIndex && lx === lastLx && lz === lastLz,
    },
    z: {
        segmentStart: (blockOffset, lx, ly, blockSize) =>
            blockOffset + localBlockIndex(lx, ly, 0, blockSize),
        origin: (originX, originY, originZ, lx, ly) =>
            [originX + lx, originY + ly, originZ] as const,
        isLast: (blockIndex, lastBlockIndex, lx, ly, lastLx, lastLy) =>
            blockIndex === lastBlockIndex && lx === lastLx && ly === lastLy,
    },
};

export const iterateSparseBlockAxis = <T>(
    blocks: ReadonlyMap<number, number>,
    blockSize: number,
    shift: number,
    data: TypedBuffer<T>,
    callback: Callback<T>,
    axis: IterateAxis,
): void => {
    const entries = [...blocks.entries()];
    if (entries.length === 0) {
        return;
    }

    const blockVolume = blockSize * blockSize * blockSize;
    const spec = sparseBlockAxisSpecs[axis];
    const length = blockSize;
    const blockPlane = blockSize * blockSize;
    const step = axis === "x" ? 1 : axis === "y" ? blockSize : blockPlane;
    const segments = [0, length];
    const lastBlockIndex = entries.length - 1;
    const lastCoord = blockSize - 1;

    const outerLoop = axis === "z"
        ? (fn: (a: number, b: number) => void) => {
            for (let ly = 0; ly < blockSize; ly++) {
                for (let lx = 0; lx < blockSize; lx++) {
                    fn(lx, ly);
                }
            }
        }
        : axis === "y"
            ? (fn: (a: number, b: number) => void) => {
                for (let lz = 0; lz < blockSize; lz++) {
                    for (let lx = 0; lx < blockSize; lx++) {
                        fn(lx, lz);
                    }
                }
            }
            : (fn: (a: number, b: number) => void) => {
                for (let lz = 0; lz < blockSize; lz++) {
                    for (let ly = 0; ly < blockSize; ly++) {
                        fn(ly, lz);
                    }
                }
            };

    for (let blockIndex = 0; blockIndex < entries.length; blockIndex++) {
        const [key, blockOffset] = entries[blockIndex]!;
        const { bx, by, bz } = unpackBlockKey(key);
        const originX = bx << shift;
        const originY = by << shift;
        const originZ = bz << shift;

        outerLoop((a, b) => {
            segments[0] = spec.segmentStart(blockOffset, a, b, blockSize, blockVolume);
            const [x, y, z] = spec.origin(originX, originY, originZ, a, b);
            callback(
                data,
                segments,
                step,
                x,
                y,
                z,
                spec.isLast(blockIndex, lastBlockIndex, a, b, lastCoord, lastCoord),
            );
        });
    }
};
