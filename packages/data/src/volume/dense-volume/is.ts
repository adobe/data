
import type { DenseVolume } from "./dense-volume.js";

/**
 * Type guard to check if a value is a DenseVolume.
 */
export const is = <T>(value: { readonly type: string }): value is DenseVolume<T> => {
    return value.type === "dense";
};
