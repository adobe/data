// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { TypedArray } from "../internal/typed-array/index.js";

export const arrayBufferType = "array";

class ArrayTypedBuffer<T> extends TypedBuffer<T> {
    public readonly type: TypedBufferType = arrayBufferType;
    public readonly typedArrayElementSizeInBytes: number = 0;
    
    private array: T[];

    constructor(schema: Schema, initialCapacityOrArray: number | T[]) {
        super(schema);
        if (typeof initialCapacityOrArray === "number") {
            this.array = new Array<T>(initialCapacityOrArray);
        } else {
            this.array = initialCapacityOrArray;
        }
    }

    get capacity(): number {
        return this.array.length;
    }

    set capacity(value: number) {
        this.array.length = value;
    }

    getTypedArray(): TypedArray {
        throw new Error("Typed array not supported");
    }

    get(index: number): T {
        return this.array[index];
    }

    set(index: number, value: T): void {
        this.array[index] = value;
    }

    copyWithin(target: number, start: number, end: number): void {
        this.array.copyWithin(target, start, end);
    }

    slice(start = 0, end = this.array.length): ArrayLike<T> & Iterable<T> {
        if (start === 0 && end === this.array.length) {
            return this.array;
        }
        return this.array.slice(start, end);
    }

    copy(): TypedBuffer<T> {
        return new ArrayTypedBuffer<T>(this.schema, this.array.slice(0));
    }
}

export const createArrayBuffer = <S extends Schema, T = Schema.ToType<S>>(
    schema: S,
    initialCapacity: number,
): TypedBuffer<T> => {
    return new ArrayTypedBuffer<T>(schema, initialCapacity);
};
