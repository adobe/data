// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../internal/array-buffer-like/resize.js";
import { I32 } from "../math/i32/index.js";
import { Schema } from "../schema/index.js";
import { TypedArrayConstructor, TypedArray } from "../internal/typed-array/index.js";
import { U32 } from "../math/u32/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";

const getTypedArrayConstructor = (schema: Schema): TypedArrayConstructor => {
    if (schema.type === 'number' || schema.type === 'integer') {
        if (schema.type === "integer") {
            if (schema.minimum !== undefined && schema.maximum !== undefined) {
                if (schema.minimum >= U32.schema.minimum && schema.maximum <= U32.schema.maximum) {
                    return Uint32Array;
                }
                if (schema.minimum >= I32.schema.minimum && schema.maximum <= I32.schema.maximum) {
                    return Int32Array;
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