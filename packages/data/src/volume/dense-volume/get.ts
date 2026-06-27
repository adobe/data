import type { DenseVolume } from "./dense-volume.js";
import { getIndex } from "./get-index.js";

/**
 * Gets the voxel value at the specified coordinates in a DenseVolume.
 * @returns The voxel value, or null if coordinates are out of bounds
 */
export const get = <T>(volume: DenseVolume<T>, x: number, y: number, z: number): T | null => {
    const [width, height, depth] = volume.size;

    if (x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) {
        return null;
    }

    const index = getIndex(volume, x, y, z);
    return volume.data.get(index);
};
