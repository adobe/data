
import { Vec3 } from "../../math/vec3/index.js";
import type { DenseVolume } from "./dense-volume.js";
import type { Index } from "./index-type.js";

export const getCoordinates = <T>(volume: DenseVolume<T>, index: Index): Vec3 => {
    const [width, height] = volume.size;
    const z = Math.floor(index / (width * height));
    const y = Math.floor((index % (width * height)) / width);
    const x = index % width;
    return [x, y, z];
};
