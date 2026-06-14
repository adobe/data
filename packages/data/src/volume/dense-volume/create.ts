
import type { DenseVolume } from "./dense-volume.js";

export const create = <T>(volume: Omit<DenseVolume<T>, "type">): DenseVolume<T> => {
    return {
        type: "dense",
        ...volume,
    };
};
