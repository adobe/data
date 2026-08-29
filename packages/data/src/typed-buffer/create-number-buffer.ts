// © 2026 Adobe. MIT License. See /LICENSE for details.
import { I32 } from "../math/i32/index.js";
import { Schema } from "../schema/index.js";
import { TypedArrayConstructor, TypedArray } from "../internal/typed-array/index.js";
import { U32 } from "../math/u32/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { MemoryAllocator, defaultMemoryAllocator } from "../cache/memory-allocator.js";

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
    
    private array: TypedArray;
    private readonly typedArrayConstructor: TypedArrayConstructor;
    private readonly allocator: MemoryAllocator;
    private readonly unsubscribe: () => void;
    private disposed = false;
    private _capacity: number;

    constructor(schema: Schema, initialCapacity: number, allocator: MemoryAllocator = defaultMemoryAllocator) {
        super(schema);
        this.typedArrayConstructor = getTypedArrayConstructor(schema);
        this.typedArrayElementSizeInBytes = this.typedArrayConstructor.BYTES_PER_ELEMENT;
        this.allocator = allocator;
        this._capacity = initialCapacity;
        this.array = allocator.allocate(this.typedArrayConstructor, initialCapacity);
        // A detaching allocator (wasm) rebuilds every live view on grow.
        this.unsubscribe = allocator.needsRefresh(() => {
            this.array = allocator.refresh(this.array);
        });
    }

    override dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unsubscribe();
        this.allocator.release(this.allocator.refresh(this.array));
    }

    get capacity(): number {
        return this._capacity;
    }

    set capacity(value: number) {
        if (value !== this._capacity) {
            // allocate() may grow a detaching arena and refresh this.array via
            // needsRefresh, so re-read the (now valid) old view AFTER allocating
            // and release that one — releasing a pre-allocate reference would
            // leak the block once the arena had swapped the view out.
            const next = this.allocator.allocate(this.typedArrayConstructor, value);
            const old = this.allocator.refresh(this.array);
            next.set(old.subarray(0, Math.min(this._capacity, value)));
            this.array = next;
            this._capacity = value;
            this.allocator.release(old);
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

    copy(allocator?: MemoryAllocator): TypedBuffer<number> {
        // A copy is detached — it owns its own buffer. `allocator` lets the
        // caller place the copy on a specific arena (default: per-copy buffer).
        const copy = new NumberTypedBuffer(this.schema, this._capacity, allocator);
        copy.array.set(this.allocator.refresh(this.array));
        return copy;
    }
}

export const createNumberBuffer = (
    schema: Schema,
    initialCapacity: number,
    allocator?: MemoryAllocator,
): TypedBuffer<number> => {
    return new NumberTypedBuffer(schema, initialCapacity, allocator);
};