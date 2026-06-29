// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import type { TypedBuffer } from "../../../typed-buffer/typed-buffer.js";
import type { Volume } from "../volume.js";
import type { Callback } from "../callback.js";

const getIndex = (size: Vec3, x: number, y: number, z: number): number => {
    const [width, height] = size;
    return x + width * (y + z * height);
};

const isInBounds = (size: Vec3, x: number, y: number, z: number): boolean => {
    const [width, height, depth] = size;
    return x >= 0 && x < width && y >= 0 && y < height && z >= 0 && z < depth;
};

const defaultFromSchema = <T>(schema: Schema): T => {
    if (!("default" in schema)) {
        throw new Error("DenseVolume schema must include a default value");
    }
    return schema.default as T;
};

export class DenseVolume<T> implements Volume<T> {
    readonly size: Vec3;
    readonly data: TypedBuffer<T>;
    readonly #defaultValue: T;

    constructor(size: Vec3, data: TypedBuffer<T>) {
        this.#defaultValue = defaultFromSchema<T>(data.schema);
        this.size = size;
        this.data = data;
    }

    get(x: number, y: number, z: number): T {
        if (!isInBounds(this.size, x, y, z)) {
            return this.#defaultValue;
        }
        return this.data.get(getIndex(this.size, x, y, z));
    }

    set(x: number, y: number, z: number, value: T): void {
        if (!isInBounds(this.size, x, y, z)) {
            return;
        }
        this.data.set(getIndex(this.size, x, y, z), value);
    }

    iterate(callback: Callback<T>): void {
        const [width, height, depth] = this.size;
        if (width === 0 || height === 0 || depth === 0) {
            return;
        }

        const segments = [0, width];
        const lastY = height - 1;
        const lastZ = depth - 1;

        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                segments[0] = getIndex(this.size, 0, y, z);
                callback(
                    this.data,
                    segments,
                    1,
                    0,
                    y,
                    z,
                    y === lastY && z === lastZ,
                );
            }
        }
    }
}
