// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";

export const getDenseIndex = (size: Vec3, x: number, y: number, z: number): number => {
    const [width, height] = size;
    return x + width * (y + z * height);
};

export const isInBounds = (size: Vec3, x: number, y: number, z: number): boolean => {
    const [width, height, depth] = size;
    return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < depth;
};

export const localBlockIndex = (lx: number, ly: number, lz: number, blockSize: number): number =>
    lx + blockSize * (ly + blockSize * lz);
