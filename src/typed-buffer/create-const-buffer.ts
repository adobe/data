// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { TypedArray } from "../internal/typed-array/index.js";

export const constBufferType = "const";

class ConstTypedBuffer<T> extends TypedBuffer<T> {

    public capacity: number;
    private readonly constValue: T;
    public readonly type: TypedBufferType = constBufferType;

    constructor(schema: Schema, initialCapacity: number) {
        super(schema);
        this.capacity = initialCapacity;
        this.constValue = schema.const;
    }

    get typedArrayElementSizeInBytes(): number {
        return 0;
    }

    getTypedArray(): TypedArray {
        throw new Error("Const buffer does not support getTypedArray");
    }

    get(_index: number): T {
        return this.constValue;
    }

    set(_index: number, _value: T): void {
        // No-op: const buffer ignores set calls
    }

    isDefault(_index: number): boolean {
        return this.constValue === this.schema.default;
    }

    copyWithin(_target: number, _start: number, _end: number): void {
        // No-op: const buffer copyWithin is a no-op
    }

    slice(start = 0, end = this.capacity): ArrayLike<T> & Iterable<T> {
        return Array(Math.max(0, end - start)).fill(this.constValue);
    }

    copy(): TypedBuffer<T> {
        return this;
    }
}

export const createConstBuffer = <T>(
    schema: Schema,
    initialCapacity: number,
): TypedBuffer<T> => {
    return new ConstTypedBuffer<T>(schema, initialCapacity);
};
