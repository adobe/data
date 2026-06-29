// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import type { TypedBuffer } from "../../../typed-buffer/typed-buffer.js";
import type { Volume } from "../volume.js";
import type { Callback, SegmentViewCallback } from "../callback.js";
import {
    buildSparseBlockAxisPlan,
    runSparseBlockAxisPlan,
    runSparseBlockAxisPlanView,
    type SparseBlockAxisPlan,
} from "../iterate-axis.js";
import { localBlockIndex } from "../volume-index.js";
import { packBlockKey } from "./pack-block-key.js";

const localIndex = (lx: number, ly: number, lz: number, blockSize: number): number =>
    localBlockIndex(lx, ly, lz, blockSize);

const defaultFromSchema = <T>(schema: Schema): T => {
    if (!("default" in schema)) {
        throw new Error("SparseBlockVolume schema must include a default value");
    }
    return schema.default as T;
};

const blockShift = (blockSize: number): number => {
    const shift = Math.log2(blockSize);
    if (!Number.isInteger(shift) || shift < 0) {
        throw new Error("SparseBlockVolume blockSize must be a power of two");
    }
    return shift;
};

const blockCoord = (coordinate: number, shift: number): number => coordinate >> shift;

const localCoord = (coordinate: number, blockSize: number, shift: number): number =>
    coordinate - (coordinate >> shift) * blockSize;

export class SparseBlockVolume<T> implements Volume<T> {
    readonly blockSize: number;
    readonly #shift: number;
    readonly #blockVolume: number;
    readonly #data: TypedBuffer<T>;
    readonly #blocks = new Map<number, number>();
    readonly #defaultValue: T;
    #size: Vec3 = [0, 0, 0];
    #axisPlans: Partial<Record<"x" | "y" | "z", SparseBlockAxisPlan>> | undefined;

    constructor(blockSize: number, data: TypedBuffer<T>) {
        this.blockSize = blockSize;
        this.#shift = blockShift(blockSize);
        this.#blockVolume = blockSize * blockSize * blockSize;
        this.#data = data;
        this.#defaultValue = defaultFromSchema<T>(data.schema);
    }

    get size(): Vec3 {
        return this.#size;
    }

    toSerialized(): {
        readonly blockSize: number;
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
        blockSize: number,
        data: TypedBuffer<Schema.ToType<S>>,
        size: Vec3,
        blocks: readonly (readonly [number, number])[],
    ): SparseBlockVolume<Schema.ToType<S>> {
        const volume = new SparseBlockVolume(blockSize, data);
        volume.#size = size;
        for (const [key, offset] of blocks) {
            volume.#blocks.set(key, offset);
        }
        volume.#axisPlans = undefined;
        return volume;
    }

    get(x: number, y: number, z: number): T {
        const offset = this.#blockOffset(x, y, z);
        if (offset === undefined) {
            return this.#defaultValue;
        }
        const index = offset + localIndex(
            localCoord(x, this.blockSize, this.#shift),
            localCoord(y, this.blockSize, this.#shift),
            localCoord(z, this.blockSize, this.#shift),
            this.blockSize,
        );
        return this.#data.get(index);
    }

    set(x: number, y: number, z: number, value: T): void {
        const offset = this.#ensureBlock(x, y, z);
        const index = offset + localIndex(
            localCoord(x, this.blockSize, this.#shift),
            localCoord(y, this.blockSize, this.#shift),
            localCoord(z, this.blockSize, this.#shift),
            this.blockSize,
        );
        this.#data.set(index, value);
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

    iterateXView(callback: SegmentViewCallback<T>): void {
        this.#iterateAxisView("x", callback);
    }

    iterateYView(callback: SegmentViewCallback<T>): void {
        this.#iterateAxisView("y", callback);
    }

    iterateZView(callback: SegmentViewCallback<T>): void {
        this.#iterateAxisView("z", callback);
    }

    #planFor(axis: "x" | "y" | "z"): SparseBlockAxisPlan | undefined {
        let plan = this.#axisPlans?.[axis];
        if (plan === undefined) {
            plan = buildSparseBlockAxisPlan(this.#blocks, this.blockSize, this.#shift, axis);
            if (plan === undefined) {
                return undefined;
            }
            if (this.#axisPlans === undefined) {
                this.#axisPlans = {};
            }
            this.#axisPlans[axis] = plan;
        }
        return plan;
    }

    #iterateAxis(axis: "x" | "y" | "z", callback: Callback<T>): void {
        const plan = this.#planFor(axis);
        if (plan === undefined) {
            return;
        }
        runSparseBlockAxisPlan(plan, this.#shift, this.#data, callback);
    }

    #iterateAxisView(axis: "x" | "y" | "z", callback: SegmentViewCallback<T>): void {
        const plan = this.#planFor(axis);
        if (plan === undefined) {
            return;
        }
        runSparseBlockAxisPlanView(plan, this.#shift, this.#data, callback);
    }

    #invalidateAxisPlans(): void {
        this.#axisPlans = undefined;
    }

    #blockOffset(x: number, y: number, z: number): number | undefined {
        const key = packBlockKey(
            blockCoord(x, this.#shift),
            blockCoord(y, this.#shift),
            blockCoord(z, this.#shift),
        );
        return this.#blocks.get(key);
    }

    #ensureBlock(x: number, y: number, z: number): number {
        const bx = blockCoord(x, this.#shift);
        const by = blockCoord(y, this.#shift);
        const bz = blockCoord(z, this.#shift);
        const key = packBlockKey(bx, by, bz);
        let offset = this.#blocks.get(key);
        if (offset === undefined) {
            offset = this.#data.capacity;
            this.#data.capacity = offset + this.#blockVolume;
            for (let i = 0; i < this.#blockVolume; i++) {
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
