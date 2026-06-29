// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import type { TypedBuffer } from "../../../typed-buffer/typed-buffer.js";
import type { Volume } from "../volume.js";
import type { Callback } from "../callback.js";
import { iterateDenseAxis } from "../iterate-axis.js";
import { getDenseIndex, isInBounds } from "../volume-index.js";

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
        return this.data.get(getDenseIndex(this.size, x, y, z));
    }

    set(x: number, y: number, z: number, value: T): void {
        if (!isInBounds(this.size, x, y, z)) {
            return;
        }
        this.data.set(getDenseIndex(this.size, x, y, z), value);
    }

    iterateX(callback: Callback<T>): void {
        iterateDenseAxis(this.size, this.data, callback, "x");
    }

    iterateY(callback: Callback<T>): void {
        iterateDenseAxis(this.size, this.data, callback, "y");
    }

    iterateZ(callback: Callback<T>): void {
        iterateDenseAxis(this.size, this.data, callback, "z");
    }
}
