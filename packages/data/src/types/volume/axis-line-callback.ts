// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../typed-buffer/index.js";

/**
 * Called once per world-space line along the iteration axis.
 *
 * @param segments Reused flat `[offset₀, length₀, offset₁, length₁, …]`.
 *   Adjacent sparse blocks along the axis are merged into one callback with
 *   multiple pairs. Dense volumes always emit a single pair.
 * @param step Buffer index stride between consecutive voxels along the axis.
 * @param x World x of the first voxel in the line.
 * @param y World y of the first voxel in the line.
 * @param z World z of the first voxel in the line.
 * @param done True on the final line of this axis iteration.
 */
export type AxisLineCallback<T> = (
    buffer: TypedBuffer<T>,
    segments: number[],
    step: number,
    x: number,
    y: number,
    z: number,
    done: boolean,
) => void;
