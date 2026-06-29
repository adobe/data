import { TypedBuffer } from "../../typed-buffer/index.js";

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
export type Callback<T> = (buffer: TypedBuffer<T>, segments: number[], step: number, x: number, y: number, z: number, done: boolean) => void;

/**
 * Zero-copy variant: segment pairs are read from `precomputed` at
 * `[segmentStart, segmentStart + pairCount * 2)`.
 */
export type SegmentViewCallback<T> = (
    buffer: TypedBuffer<T>,
    precomputed: readonly number[],
    segmentStart: number,
    pairCount: number,
    step: number,
    x: number,
    y: number,
    z: number,
    done: boolean,
) => void;

/** One-shot axis iteration with struct-of-arrays line data. */
export interface AxisIterateBatch<T> {
    readonly buffer: TypedBuffer<T>;
    readonly step: number;
    readonly precomputedSegments: readonly number[];
    readonly stepSegmentStarts: readonly number[];
    readonly origins: readonly number[];
    readonly lineCount: number;
}

export type BatchCallback<T> = (batch: AxisIterateBatch<T>) => void;
