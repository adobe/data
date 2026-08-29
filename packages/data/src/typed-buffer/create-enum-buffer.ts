// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { TypedArray } from "../internal/typed-array/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { MemoryAllocator, defaultMemoryAllocator } from "../cache/memory-allocator.js";

export const enumBufferType = "enum";

const MAX_ENUM_VALUES = 256;

class EnumTypedBuffer<T> extends TypedBuffer<T> {
    public readonly type: TypedBufferType = enumBufferType;
    public readonly typedArrayElementSizeInBytes = 1;

    private array: Uint8Array;
    private readonly allocator: MemoryAllocator;
    private readonly unsubscribe: () => void;
    private disposed = false;
    private _capacity: number;
    private readonly indexToValue: readonly T[];
    private readonly valueToIndex: Map<T, number>;
    private readonly defaultIndex: number;

    constructor(schema: Schema, initialCapacity: number, allocator: MemoryAllocator = defaultMemoryAllocator) {
        super(schema);
        this.allocator = allocator;

        const enumValues = schema.enum as readonly T[];
        if (enumValues.length > MAX_ENUM_VALUES) {
            throw new Error(
                `Enum schema has ${enumValues.length} values, but the maximum is ${MAX_ENUM_VALUES}. ` +
                `Enum buffers use a Uint8Array and cannot represent more than ${MAX_ENUM_VALUES} distinct values.`
            );
        }

        this.indexToValue = enumValues;
        this.valueToIndex = new Map<T, number>();
        for (let i = 0; i < enumValues.length; i++) {
            this.valueToIndex.set(enumValues[i], i);
        }

        this.defaultIndex = schema.default !== undefined
            ? this.valueToIndex.get(schema.default as T) ?? 0
            : 0;

        this._capacity = initialCapacity;
        this.array = allocator.allocate(Uint8Array, initialCapacity);
        this.unsubscribe = allocator.needsRefresh(() => {
            this.array = allocator.refresh(this.array);
        });

        if (this.defaultIndex !== 0) {
            this.array.fill(this.defaultIndex);
        }
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
            const oldCapacity = this._capacity;
            const next = this.allocator.allocate(Uint8Array, value);
            const old = this.allocator.refresh(this.array);
            next.set(old.subarray(0, Math.min(oldCapacity, value)));
            if (this.defaultIndex !== 0 && value > oldCapacity) {
                next.fill(this.defaultIndex, oldCapacity, value);
            }
            this.array = next;
            this._capacity = value;
            this.allocator.release(old);
        }
    }

    getTypedArray(): TypedArray {
        return this.array;
    }

    get(index: number): T {
        return this.indexToValue[this.array[index]];
    }

    set(index: number, value: T): void {
        const enumIndex = this.valueToIndex.get(value);
        if (enumIndex === undefined) {
            throw new Error(
                `Value ${JSON.stringify(value)} is not a valid enum value. ` +
                `Expected one of: ${this.indexToValue.map(v => JSON.stringify(v)).join(", ")}`
            );
        }
        this.array[index] = enumIndex;
    }

    isDefault(index: number): boolean {
        return this.array[index] === this.defaultIndex;
    }

    copyWithin(target: number, start: number, end: number): void {
        this.array.copyWithin(target, start, end);
    }

    slice(start = 0, end = this._capacity): ArrayLike<T> & Iterable<T> {
        const result: T[] = [];
        for (let i = start; i < end; i++) {
            result.push(this.indexToValue[this.array[i]]);
        }
        return result;
    }

    copy(allocator?: MemoryAllocator): TypedBuffer<T> {
        const copy = new EnumTypedBuffer<T>(this.schema, this._capacity, allocator);
        copy.array.set(this.allocator.refresh(this.array));
        return copy;
    }
}

export const createEnumBuffer = <T>(
    schema: Schema,
    initialCapacity: number,
    allocator?: MemoryAllocator,
): TypedBuffer<T> => {
    return new EnumTypedBuffer<T>(schema, initialCapacity, allocator);
};
