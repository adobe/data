import { TypedBuffer } from "../../typed-buffer/index.js";
import type { DenseVolume } from "./dense-volume.js";

const vec3Equals = (a: readonly [number, number, number], b: readonly [number, number, number]): boolean =>
    a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Compare two DenseVolume instances for equality.
 */
export const equals = <T>(a: DenseVolume<T>, b: DenseVolume<T>): boolean => {
    if (a === b) return true;
    if (a.type !== b.type) return false;
    if (!vec3Equals(a.size, b.size)) return false;
    return TypedBuffer.equals(a.data, b.data);
};
