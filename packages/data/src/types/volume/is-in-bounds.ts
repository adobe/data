// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";

export const isInBounds = (size: Vec3, x: number, y: number, z: number): boolean => {
    const [width, height, depth] = size;
    return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < depth;
};
