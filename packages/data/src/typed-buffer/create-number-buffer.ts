// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../internal/array-buffer-like/resize.js";
import { I8 } from "../math/i8/index.js";
import { I16 } from "../math/i16/index.js";
import { I32 } from "../math/i32/index.js";
import { Schema } from "../schema/index.js";
import { TypedArrayConstructor, TypedArray } from "../internal/typed-array/index.js";
import { U8 } from "../math/u8/index.js";
import { U16 } from "../math/u16/index.js";
import { U32 } from "../math/u32/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";
import { normalizeFillRange } from "./normalize-fill-range.js";

const getTypedArrayConstructor = (schema: Schema): TypedArrayConstructor => {
    if (schema.type === 'number' || schema.type === 'integer') {
        if (schema.type === "integer") {
            if (schema.minimum !== undefined && schema.maximum !== undefined) {
                const { minimum: min, maximum: max } = schema;
                if (min >= 0) {
                    if (max <= U8.schema.maximum)  return Uint8Array;
                    if (max <= U16.schema.maximum) return Uint16Array;
                    if (max <= U32.schema.maximum) return Uint32Array;
                } else {
                    if (min >= I8.schema.minimum  && max <= I8.schema.maximum)  return Int8Array;
                    if (min >= I16.schema.minimum && max <= I16.schema.maximum) return Int16Array;
                    if (min >= I32.schema.minimum && max <= I32.schema.maximum) return Int32Array;
                }
            }
        }
        else if (schema.precision === 1) {
            return Float32Array;
        }
        return Float64Array;
    }
    throw new Error("Schema is not a valid number schema");
}

export const numberBufferType = "number";

class NumberTypedBuffer extends TypedBuffer<number> {
    public readonly type: TypedBufferType = numberBufferType;
    public readonly typedArrayElementSizeInBytes: number;
    
    private arrayBuffer: ArrayBuffer | SharedArrayBuffer;
    private array: TypedArray;
    private readonly typedArrayConstructor: TypedArrayConstructor;
    private _capacity: number;

    constructor(schema: Schema, initialCapacity: number) {
        super(schema);
        this.typedArrayConstructor = getTypedArrayConstructor(schema);
        this.typedArrayElementSizeInBytes = this.typedArrayConstructor.BYTES_PER_ELEMENT;
        this._capacity = initialCapacity;
        this.arrayBuffer = createSharedArrayBuffer(this.typedArrayElementSizeInBytes * initialCapacity);
        this.array = new this.typedArrayConstructor(this.arrayBuffer);
    }

    get capacity(): number {
        return this._capacity;
    }

    set capacity(value: number) {
        if (value !== this._capacity) {
            this._capacity = value;
            this.arrayBuffer = resize(this.arrayBuffer, value * this.typedArrayElementSizeInBytes); 
            this.array = new this.typedArrayConstructor(this.arrayBuffer);
        }
    }

    getTypedArray(): TypedArray {
        return this.array;
    }

    get(index: number): number {
        return this.array[index];
    }

    set(index: number, value: number): void {
        this.array[index] = value;
    }

    fill(value: number, start?: number, end?: number): void {
        const range = normalizeFillRange(this._capacity, start, end);
        if (range) {
            this.array.fill(value, ...range);
        }
    }

    isDefault(index: number): boolean {
        // For TypedArray-backed buffers, default is always 0
        return this.array[index] === 0;
    }

    copyWithin(target: number, start: number, end: number): void {
        this.array.copyWithin(target, start, end);
    }

    slice(start = 0, end = this._capacity): ArrayLike<number> & Iterable<number> {
        return this.array.subarray(start, end);
    }

    copy(): TypedBuffer<number> {
        const copy = new NumberTypedBuffer(this.schema, this._capacity);
        copy.array.set(this.array);
        return copy;
    }
}

export const createNumberBuffer = (
    schema: Schema,
    initialCapacity: number,
): TypedBuffer<number> => {
    return new NumberTypedBuffer(schema, initialCapacity);
};