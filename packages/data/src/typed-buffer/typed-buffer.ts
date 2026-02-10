// © 2026 Adobe. MIT License. See /LICENSE for details.
import { TypedArray } from "../internal/typed-array/index.js";
import { Schema } from "../schema/index.js";
import { typedBufferEquals } from "./typed-buffer-equals.js";

export type TypedBufferType = "array" | "const" | "number" | "struct";

export interface ReadonlyTypedBuffer<T> {
    readonly type: TypedBufferType;
    readonly schema: Schema;
    readonly capacity: number;
    readonly typedArrayElementSizeInBytes: number;
    get(index: number): T;
    slice(start?: number, end?: number): ArrayLike<T> & Iterable<T>;
    isDefault(index: number): boolean;
}

export abstract class TypedBuffer<T> implements ReadonlyTypedBuffer<T> {
    
    public readonly __brand = "TypedBuffer";

    constructor(public readonly schema: Schema) {
    }
    
    abstract copyWithin(target: number, start: number, end: number): void;
    abstract readonly type: TypedBufferType;
    abstract capacity: number;
    abstract readonly typedArrayElementSizeInBytes: number;
    /**
     * Returns the typed array of the buffer.
     * @throws If the buffer is not backed by a typed array.
     */
    abstract getTypedArray(): TypedArray;
    abstract get(index: number): T;
    abstract slice(start?: number, end?: number): ArrayLike<T> & Iterable<T>;
    abstract set(index: number, value: T): void;
    abstract copy(): TypedBuffer<T>;
    abstract isDefault(index: number): boolean;

    /**
     * Checks if two TypedBuffer instances are deeply equal.
     * @param a The first TypedBuffer.
     * @param b The second TypedBuffer.
     * @returns True if the buffers are deeply equal, false otherwise.
     */
    static equals = typedBufferEquals;
}

