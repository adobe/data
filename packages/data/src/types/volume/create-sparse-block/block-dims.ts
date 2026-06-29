// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { IterateAxis } from "../iterate-axis.js";
import {
    createIndexFromWorld,
    createKeyFromWorld,
    decodeBlockKeyInline,
    packPlaneKeyInline,
} from "./block-key.js";

export interface AxisIterateLayout {
    readonly step: number;
    readonly blockPlane: number;
    readonly segmentLength: number;
    readonly innerA: number;
    readonly groupKey: (bx: number, by: number, bz: number) => number;
    readonly vary: (bx: number, by: number, bz: number) => number;
    readonly segmentOffset: (offset: number, la: number, lb: number) => number;
    readonly writeOrigin: (
        bx: number,
        by: number,
        bz: number,
        la: number,
        lb: number,
        origins: number[],
        stepIndex: number,
    ) => void;
}

export interface BlockDims {
    readonly size: Vec3;
    readonly sx: number;
    readonly sy: number;
    readonly sz: number;
    readonly shiftX: number;
    readonly shiftY: number;
    readonly shiftZ: number;
    readonly volume: number;
    readonly planeYZ: number;
    readonly planeXZ: number;
    readonly planeXY: number;
    readonly strideY: number;
    readonly strideZ: number;
    readonly keyFromWorld: (x: number, y: number, z: number) => number;
    readonly indexFromWorld: (x: number, y: number, z: number, blockOffset: number) => number;
    readonly decodeKey: (key: number) => readonly [bx: number, by: number, bz: number];
    readonly iterate: Record<IterateAxis, AxisIterateLayout>;
}

export const normalizeBlockSize = (blockSize: number | Vec3): Vec3 =>
    typeof blockSize === "number" ? [blockSize, blockSize, blockSize] : blockSize;

const axisShift = (size: number, axis: "x" | "y" | "z"): number => {
    const shift = Math.log2(size);
    if (!Number.isInteger(shift) || shift < 0) {
        throw new Error(`SparseBlockVolume block size ${axis} must be a power of two`);
    }
    return shift;
};

const createIterateLayouts = (
    sx: number,
    sy: number,
    sz: number,
    shiftX: number,
    shiftY: number,
    shiftZ: number,
    strideY: number,
    strideZ: number,
    planeYZ: number,
    planeXZ: number,
    planeXY: number,
): Record<IterateAxis, AxisIterateLayout> => ({
    x: {
        step: 1,
        blockPlane: planeYZ,
        segmentLength: sx,
        innerA: sy,
        groupKey: (_bx, by, bz) => packPlaneKeyInline(bz, by),
        vary: (bx) => bx,
        segmentOffset: (offset, ly, lz) => offset + ly * sx + lz * strideZ,
        writeOrigin: (bx, by, bz, la, lb, origins, stepIndex) => {
            const base = stepIndex * 3;
            origins[base] = bx << shiftX;
            origins[base + 1] = (by << shiftY) + la;
            origins[base + 2] = (bz << shiftZ) + lb;
        },
    },
    y: {
        step: sx,
        blockPlane: planeXZ,
        segmentLength: sy,
        innerA: sx,
        groupKey: (bx, _by, bz) => packPlaneKeyInline(bz, bx),
        vary: (_bx, by) => by,
        segmentOffset: (offset, lx, lz) => offset + lx + lz * strideZ,
        writeOrigin: (bx, by, bz, la, lb, origins, stepIndex) => {
            const base = stepIndex * 3;
            origins[base] = (bx << shiftX) + la;
            origins[base + 1] = by << shiftY;
            origins[base + 2] = (bz << shiftZ) + lb;
        },
    },
    z: {
        step: strideZ,
        blockPlane: planeXY,
        segmentLength: sz,
        innerA: sx,
        groupKey: (bx, by) => packPlaneKeyInline(by, bx),
        vary: (_bx, _by, bz) => bz,
        segmentOffset: (offset, lx, ly) => offset + lx + ly * sx,
        writeOrigin: (bx, by, bz, la, lb, origins, stepIndex) => {
            const base = stepIndex * 3;
            origins[base] = (bx << shiftX) + la;
            origins[base + 1] = (by << shiftY) + lb;
            origins[base + 2] = bz << shiftZ;
        },
    },
});

export const createBlockDims = (size: number | Vec3): BlockDims => {
    const [sx, sy, sz] = normalizeBlockSize(size);
    if (sx < 1 || sy < 1 || sz < 1) {
        throw new Error("SparseBlockVolume block sizes must be positive");
    }
    const shiftX = axisShift(sx, "x");
    const shiftY = axisShift(sy, "y");
    const shiftZ = axisShift(sz, "z");
    const strideY = sx;
    const strideZ = sx * sy;
    const planeYZ = sy * sz;
    const planeXZ = sx * sz;
    const planeXY = sx * sy;

    return {
        size: [sx, sy, sz],
        sx,
        sy,
        sz,
        shiftX,
        shiftY,
        shiftZ,
        volume: sx * sy * sz,
        planeYZ,
        planeXZ,
        planeXY,
        strideY,
        strideZ,
        keyFromWorld: createKeyFromWorld(shiftX, shiftY, shiftZ),
        indexFromWorld: createIndexFromWorld(sx, sy, sz, shiftX, shiftY, shiftZ, strideY),
        decodeKey: decodeBlockKeyInline,
        iterate: createIterateLayouts(
            sx, sy, sz, shiftX, shiftY, shiftZ, strideY, strideZ, planeYZ, planeXZ, planeXY,
        ),
    };
};

export const blockCoord = (coordinate: number, shift: number): number => coordinate >> shift;

export const localCoord = (coordinate: number, blockSize: number, shift: number): number =>
    coordinate - (coordinate >> shift) * blockSize;
