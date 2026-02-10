// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TypedArrayConstructor } from "../../types/typed-array-constructer.js";

export const getByteSize = (typedArrayConstructor: TypedArrayConstructor) => {
    if (typedArrayConstructor === Int32Array) {
        return 4;
    }
    if (typedArrayConstructor === Uint32Array) {
        return 4;
    }
    if (typedArrayConstructor === Float32Array) {
        return 4;
    }
    if (typedArrayConstructor === Float64Array) {
        return 8;
    }
    if (typedArrayConstructor === Int8Array) {
        return 1;
    }
    if (typedArrayConstructor === Uint8Array) {
        return 1;
    }
    if (typedArrayConstructor === Int16Array) {
        return 2;
    }
    if (typedArrayConstructor === Uint16Array) {
        return 2;
    }
    throw new Error(`Unknown typed array constructor: ${typedArrayConstructor}`);
}