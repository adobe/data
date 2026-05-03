// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../internal/array-buffer-like/resize.js";
import { Schema } from "../schema/index.js";
import { TypedArray } from "../internal/typed-array/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";
import { normalizeFillRange } from "./normalize-fill-range.js";

export const booleanBufferType = "boolean";

class BooleanTypedBuffer extends TypedBuffer<boolean> {
    public readonly type: TypedBufferType = booleanBufferType;
    public readonly typedArrayElementSizeInBytes = 1;

    private arrayBuffer: ArrayBuffer | SharedArrayBuffer;
    private array: Uint8Array;
    private _capacity: number;
    private readonly defaultByte: number;

    constructor(schema: Schema, initialCapacity: number) {
        super(schema);

        this.defaultByte =
            "default" in schema ? (schema.default ? 1 : 0) : 0;

        this._capacity = initialCapacity;
        this.arrayBuffer = createSharedArrayBuffer(initialCapacity);
        this.array = new Uint8Array(this.arrayBuffer);

        if (this.defaultByte !== 0) {
            this.array.fill(this.defaultByte);
        }
    }

    get capacity(): number {
        return this._capacity;
    }

    set capacity(value: number) {
        if (value !== this._capacity) {
            const oldCapacity = this._capacity;
            this._capacity = value;
            this.arrayBuffer = resize(this.arrayBuffer, value);
            this.array = new Uint8Array(this.arrayBuffer);
            if (this.defaultByte !== 0 && value > oldCapacity) {
                this.array.fill(this.defaultByte, oldCapacity, value);
            }
        }
    }

    getTypedArray(): TypedArray {
        return this.array;
    }

    get(index: number): boolean {
        return this.array[index] !== 0;
    }

    set(index: number, value: boolean): void {
        this.array[index] = value ? 1 : 0;
    }

    fill(value: boolean, start?: number, end?: number): void {
        const range = normalizeFillRange(this._capacity, start, end);
        if (range) {
            this.array.fill(value ? 1 : 0, ...range);
        }
    }

    isDefault(index: number): boolean {
        return this.array[index] === this.defaultByte;
    }

    copyWithin(target: number, start: number, end: number): void {
        this.array.copyWithin(target, start, end);
    }

    slice(start = 0, end = this._capacity): ArrayLike<boolean> & Iterable<boolean> {
        const out: boolean[] = [];
        for (let i = start; i < end; i++) {
            out.push(this.array[i] !== 0);
        }
        return out;
    }

    copy(): TypedBuffer<boolean> {
        const copy = new BooleanTypedBuffer(this.schema, this._capacity);
        copy.array.set(this.array);
        return copy;
    }
}

export const createBooleanBuffer = (
    schema: Schema,
    initialCapacity: number,
): TypedBuffer<boolean> => {
    return new BooleanTypedBuffer(schema, initialCapacity);
};
