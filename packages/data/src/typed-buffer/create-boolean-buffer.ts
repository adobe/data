// © 2026 Adobe. MIT License. See /LICENSE for details.
import { TypedArray } from "../internal/typed-array/index.js";
import { Schema } from "../schema/index.js";
import { MemoryAllocator, defaultMemoryAllocator } from "../cache/memory-allocator.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";

export const booleanBufferType = "boolean";

export const booleanWordCount = (capacity: number): number =>
    Math.ceil(capacity / 32);

export const booleanStorageByteLength = (capacity: number): number =>
    booleanWordCount(capacity) * 4;

const getBit = (words: Uint32Array, index: number): boolean =>
    ((words[index >>> 5] >>> (index & 31)) & 1) !== 0;

const setBit = (words: Uint32Array, index: number, value: boolean): void => {
    const wordIndex = index >>> 5;
    const bitIndex = index & 31;
    if (value) {
        words[wordIndex] |= 1 << bitIndex;
    } else {
        words[wordIndex] &= ~(1 << bitIndex);
    }
};

class BooleanTypedBuffer extends TypedBuffer<boolean> {
    public readonly type: TypedBufferType = booleanBufferType;
    public readonly typedArrayElementSizeInBytes = 0;

    private array: Uint32Array;
    private readonly allocator: MemoryAllocator;
    private readonly unsubscribe: () => void;
    private disposed = false;
    private _capacity: number;

    constructor(schema: Schema, initialCapacity: number, allocator: MemoryAllocator = defaultMemoryAllocator) {
        super(schema);
        this.allocator = allocator;
        this._capacity = initialCapacity;
        this.array = allocator.allocate(Uint32Array, booleanWordCount(initialCapacity));
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
            const next = this.allocator.allocate(Uint32Array, booleanWordCount(value));
            const old = this.allocator.refresh(this.array);
            next.set(old.subarray(0, Math.min(next.length, old.length)));
            this.array = next;
            this._capacity = value;
            this.allocator.release(old);
        }
    }

    getTypedArray(): TypedArray {
        return this.array;
    }

    get(index: number): boolean {
        return getBit(this.array, index);
    }

    set(index: number, value: boolean): void {
        setBit(this.array, index, value);
    }

    isDefault(index: number): boolean {
        return !this.get(index);
    }

    copyWithin(target: number, start: number, end: number): void {
        if (target === start || end <= start) {
            return;
        }
        const count = end - start;
        if (target < start || target >= end) {
            for (let i = 0; i < count; i++) {
                this.set(target + i, this.get(start + i));
            }
        } else {
            for (let i = count - 1; i >= 0; i--) {
                this.set(target + i, this.get(start + i));
            }
        }
    }

    slice(start = 0, end = this._capacity): ArrayLike<boolean> & Iterable<boolean> {
        const result = new Array<boolean>(Math.max(0, end - start));
        for (let i = start; i < end; i++) {
            result[i - start] = this.get(i);
        }
        return result;
    }

    copy(allocator?: MemoryAllocator): TypedBuffer<boolean> {
        const copy = new BooleanTypedBuffer(this.schema, this._capacity, allocator);
        copy.array.set(this.allocator.refresh(this.array));
        return copy;
    }
}

export const createBooleanBuffer = (
    schema: Schema,
    initialCapacity: number,
    allocator?: MemoryAllocator,
): TypedBuffer<boolean> => {
    return new BooleanTypedBuffer(schema, initialCapacity, allocator);
};
