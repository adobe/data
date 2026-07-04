// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../math/index.js";

export const getDenseIndex = (size: Vec3, x: number, y: number, z: number): number => {
    const [width, height] = size;
    return x + width * (y + z * height);
};
