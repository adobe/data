import { TypedBuffer } from "../../typed-buffer/index.js";

/**
 * Called once per contiguous buffer segment along the iteration axis.
 *
 * @param segments Reused `[offset, length]` pair; `length` is the run count on the axis.
 * @param step Buffer index stride between consecutive voxels along the axis.
 * @param x World x of the first voxel in the segment.
 * @param y World y of the first voxel in the segment.
 * @param z World z of the first voxel in the segment.
 * @param done True on the final segment of this axis iteration.
 */
export type Callback<T> = (buffer: TypedBuffer<T>, segments: number[], step: number, x: number, y: number, z: number, done: boolean) => void;
