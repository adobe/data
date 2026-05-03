// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../internal/array-buffer-like/resize.js";
import { Schema } from "../schema/index.js";
import { TypedArray } from "../internal/typed-array/index.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";
import { normalizeFillRange } from "./normalize-fill-range.js";

export const enumBufferType = "enum";

const MAX_ENUM_VALUES = 256;

class EnumTypedBuffer<T> extends TypedBuffer<T> {
    public readonly type: TypedBufferType = enumBufferType;
    public readonly typedArrayElementSizeInBytes = 1;

    private arrayBuffer: ArrayBuffer | SharedArrayBuffer;
    private array: Uint8Array;
    private _capacity: number;
    private readonly indexToValue: readonly T[];
    private readonly valueToIndex: Map<T, number>;
    private readonly defaultIndex: number;

    constructor(schema: Schema, initialCapacity: number) {
        super(schema);

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
        this.arrayBuffer = createSharedArrayBuffer(initialCapacity);
        this.array = new Uint8Array(this.arrayBuffer);

        if (this.defaultIndex !== 0) {
            this.array.fill(this.defaultIndex);
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
            if (this.defaultIndex !== 0 && value > oldCapacity) {
                this.array.fill(this.defaultIndex, oldCapacity, value);
            }
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

    fill(value: T, start?: number, end?: number): void {
        const enumIndex = this.valueToIndex.get(value);
        if (enumIndex === undefined) {
            throw new Error(
                `Value ${JSON.stringify(value)} is not a valid enum value. ` +
                `Expected one of: ${this.indexToValue.map(v => JSON.stringify(v)).join(", ")}`
            );
        }
        const range = normalizeFillRange(this._capacity, start, end);
        if (range) {
            this.array.fill(enumIndex, ...range);
        }
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

    copy(): TypedBuffer<T> {
        const copy = new EnumTypedBuffer<T>(this.schema, this._capacity);
        copy.array.set(this.array);
        return copy;
    }
}

export const createEnumBuffer = <T>(
    schema: Schema,
    initialCapacity: number,
): TypedBuffer<T> => {
    return new EnumTypedBuffer<T>(schema, initialCapacity);
};
