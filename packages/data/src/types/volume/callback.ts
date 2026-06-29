import { TypedBuffer } from "../../typed-buffer/index.js";

/**
 * @param segments: Array of offset, length pairs.
 * @param step: The step size.
 * @param x: The x coordinate at the start of the first segment.
 * @param y: The y coordinate at the start of the first segment.
 * @param z: The z coordinate at the start of the first segment.
 */
export type Callback<T> = (buffer: TypedBuffer<T>, segments: number[], step: number, x: number, y: number, z: number, done: boolean) => void;
