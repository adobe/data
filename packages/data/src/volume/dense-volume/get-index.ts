
import type { DenseVolume } from "./dense-volume.js";
import type { Index } from "./index-type.js";

/**
 * Get the index of a voxel in a dense volume.
 */
export const getIndex = <T>(volume: DenseVolume<T>, x: number, y: number, z: number): Index => {
    const [width, height] = volume.size;
    return x + width * (y + z * height);
};
