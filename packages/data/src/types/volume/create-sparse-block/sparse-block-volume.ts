// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import type { TypedBuffer } from "../../../typed-buffer/typed-buffer.js";
import type { Volume } from "../volume.js";
import type { Callback } from "../callback.js";
import { packBlockKeyInline } from "./block-key.js";
import { createBlockDims, normalizeBlockSize, type BlockDims } from "./block-dims.js";
import {
    buildSparseBlockAxisPlan,
    runSparseBlockAxisPlan,
    type SparseBlockAxisPlan,
} from "./iterate-sparse-block-axis.js";

const defaultFromSchema = <T>(schema: Schema): T => {
    if (!("default" in schema)) {
        throw new Error("SparseBlockVolume schema must include a default value");
    }
    return schema.default as T;
};

export class SparseBlockVolume<T> implements Volume<T> {
    readonly blockSize: Vec3;
    readonly #dims: BlockDims;
    readonly #data: TypedBuffer<T>;
    readonly #blocks = new Map<number, number>();
    readonly #defaultValue: T;
    readonly #keyFromWorld: (x: number, y: number, z: number) => number;
    readonly #indexFromWorld: (x: number, y: number, z: number, blockOffset: number) => number;
    readonly #volume: number;
    #size: Vec3 = [0, 0, 0];
    #axisPlans: Partial<Record<"x" | "y" | "z", SparseBlockAxisPlan>> | undefined;

    constructor(blockSize: number | Vec3, data: TypedBuffer<T>) {
        this.#dims = createBlockDims(blockSize);
        this.blockSize = this.#dims.size;
        this.#data = data;
        this.#defaultValue = defaultFromSchema<T>(data.schema);
        this.#keyFromWorld = this.#dims.keyFromWorld;
        this.#indexFromWorld = this.#dims.indexFromWorld;
        this.#volume = this.#dims.volume;
    }

    get dims(): BlockDims {
        return this.#dims;
    }

    get size(): Vec3 {
        return this.#size;
    }

    toSerialized(): {
        readonly blockSize: Vec3;
        readonly size: Vec3;
        readonly blocks: readonly (readonly [number, number])[];
        readonly data: TypedBuffer<T>;
    } {
        return {
            blockSize: this.blockSize,
            size: this.#size,
            blocks: [...this.#blocks.entries()],
            data: this.#data,
        };
    }

    static fromSerialized<S extends Schema>(
        blockSize: number | Vec3,
        data: TypedBuffer<Schema.ToType<S>>,
        size: Vec3,
        blocks: readonly (readonly [number, number])[],
    ): SparseBlockVolume<Schema.ToType<S>> {
        const volume = new SparseBlockVolume(normalizeBlockSize(blockSize), data);
        volume.#size = size;
        for (const [key, offset] of blocks) {
            volume.#blocks.set(key, offset);
        }
        volume.#axisPlans = undefined;
        return volume;
    }

    get(x: number, y: number, z: number): T {
        const offset = this.#blocks.get(this.#keyFromWorld(x, y, z));
        if (offset === undefined) {
            return this.#defaultValue;
        }
        return this.#data.get(this.#indexFromWorld(x, y, z, offset));
    }

    set(x: number, y: number, z: number, value: T): void {
        const offset = this.#ensureBlock(x, y, z);
        this.#data.set(this.#indexFromWorld(x, y, z, offset), value);
        this.#expandSize(x, y, z);
    }

    iterateX(callback: Callback<T>): void {
        this.#iterateAxis("x", callback);
    }

    iterateY(callback: Callback<T>): void {
        this.#iterateAxis("y", callback);
    }

    iterateZ(callback: Callback<T>): void {
        this.#iterateAxis("z", callback);
    }

    #iterateAxis(axis: "x" | "y" | "z", callback: Callback<T>): void {
        let plan = this.#axisPlans?.[axis];
        if (plan === undefined) {
            plan = buildSparseBlockAxisPlan(this.#blocks, this.#dims, axis);
            if (plan === undefined) {
                return;
            }
            if (this.#axisPlans === undefined) {
                this.#axisPlans = {};
            }
            this.#axisPlans[axis] = plan;
        }
        runSparseBlockAxisPlan(plan, this.#data, callback);
    }

    #invalidateAxisPlans(): void {
        this.#axisPlans = undefined;
    }

    #ensureBlock(x: number, y: number, z: number): number {
        const key = this.#keyFromWorld(x, y, z);
        let offset = this.#blocks.get(key);
        if (offset === undefined) {
            offset = this.#data.capacity;
            this.#data.capacity = offset + this.#volume;
            for (let i = 0; i < this.#volume; i++) {
                this.#data.set(offset + i, this.#defaultValue);
            }
            this.#blocks.set(key, offset);
            this.#invalidateAxisPlans();
        }
        return offset;
    }

    #expandSize(x: number, y: number, z: number): void {
        if (x >= 0) {
            this.#size = [Math.max(this.#size[0], x + 1), this.#size[1], this.#size[2]];
        }
        if (y >= 0) {
            this.#size = [this.#size[0], Math.max(this.#size[1], y + 1), this.#size[2]];
        }
        if (z >= 0) {
            this.#size = [this.#size[0], this.#size[1], Math.max(this.#size[2], z + 1)];
        }
    }
}

/** Used when allocating blocks by unpacked coordinates (tests/serialization). */
export const packBlockKey = packBlockKeyInline;
