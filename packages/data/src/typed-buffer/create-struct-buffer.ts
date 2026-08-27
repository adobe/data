// © 2026 Adobe. MIT License. See /LICENSE for details.
import { DataView32 } from "../internal/data-view-32/data-view-32.js";
import { createDataView32 } from "../internal/data-view-32/create-data-view-32.js";
import { Schema } from "../schema/index.js";
import { createReadStruct } from "./structs/create-read-struct.js";
import { createWriteStruct } from "./structs/create-write-struct.js";
import { getStructLayout } from "./structs/get-struct-layout.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { TypedArray } from "../internal/typed-array/index.js";
import { MemoryAllocator, defaultMemoryAllocator } from "../cache/memory-allocator.js";

export const structBufferType = "struct";

class StructTypedBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32"> extends TypedBuffer<Schema.ToType<S>> {
    public readonly type: TypedBufferType = structBufferType;
    public readonly typedArrayElementSizeInBytes: number;

    // The struct's storage is a single Float32-aligned region handed out by the
    // allocator; the DataView32 (f32/u32/i32 views) is derived from it so the
    // struct read/write codegen can address any field width. Holding the region
    // as one allocator view keeps the whole thing arena-relocatable.
    private region: Float32Array;
    private dataView: DataView32;
    private typedArray: TypedArray;
    private readonly allocator: MemoryAllocator;
    private readonly layout: NonNullable<ReturnType<typeof getStructLayout>>;
    private readonly read: ReturnType<typeof createReadStruct<Schema.ToType<S>>>;
    private readonly write: ReturnType<typeof createWriteStruct<Schema.ToType<S>>>;
    private readonly sizeInQuads: number;
    private readonly arrayType: ArrayType;
    private _capacity: number;

    constructor(schema: S, initialCapacityOrArrayBuffer: number | ArrayBuffer, allocator: MemoryAllocator = defaultMemoryAllocator) {
        super(schema);

        const structLayout = getStructLayout(schema);
        if (!structLayout) {
            throw new Error("Schema is not a valid struct schema");
        }

        this.layout = structLayout;
        this.typedArrayElementSizeInBytes = this.layout.size;
        this.arrayType = 'f32' as ArrayType;
        this.sizeInQuads = this.layout.size / 4;

        if (initialCapacityOrArrayBuffer instanceof ArrayBuffer) {
            // Wrapping a caller-supplied buffer: it is not owned by `allocator`,
            // so this buffer is not arena-managed. Fall back to the default
            // allocator for any later growth (a fresh buffer + copy), matching
            // the pre-allocator behavior.
            this.allocator = defaultMemoryAllocator;
            this.region = new Float32Array(initialCapacityOrArrayBuffer);
            this._capacity = this.region.length / this.sizeInQuads;
        } else {
            this.allocator = allocator;
            this._capacity = initialCapacityOrArrayBuffer;
            this.region = allocator.allocate(Float32Array, initialCapacityOrArrayBuffer * this.sizeInQuads);
        }
        this.dataView = this.buildDataView();
        this.typedArray = this.dataView[this.arrayType];
        this.allocator.needsRefresh(() => {
            this.region = this.allocator.refresh(this.region);
            this.dataView = this.buildDataView();
            this.typedArray = this.dataView[this.arrayType];
        });

        this.read = createReadStruct<Schema.ToType<S>>(this.layout);
        this.write = createWriteStruct<Schema.ToType<S>>(this.layout);
    }

    // The f32/u32/i32 views must cover exactly this struct's (offset, length)
    // slice of the (possibly shared) backing buffer — not the whole buffer.
    private buildDataView(): DataView32 {
        return createDataView32(this.region.buffer, this.region.byteOffset, this.region.byteLength);
    }

    get capacity(): number {
        return this._capacity;
    }

    set capacity(value: number) {
        if (value !== this._capacity) {
            const next = this.allocator.allocate(Float32Array, value * this.sizeInQuads);
            const old = this.allocator.refresh(this.region);
            next.set(old.subarray(0, Math.min(this._capacity, value) * this.sizeInQuads));
            this.region = next;
            this.dataView = this.buildDataView();
            this.typedArray = this.dataView[this.arrayType];
            this._capacity = value;
            this.allocator.release(old);
        }
    }

    getTypedArray(): TypedArray {
        return this.typedArray;
    }

    get(index: number): Schema.ToType<S> {
        return this.read(this.dataView, index);
    }

    set(index: number, value: Schema.ToType<S>): void {
        this.write(this.dataView, index, value);
    }

    isDefault(index: number): boolean {
        // For TypedArray-backed structs, check if all Float32 values in the struct region are 0
        const start = index * this.sizeInQuads;
        const end = start + this.sizeInQuads;
        for (let i = start; i < end; i++) {
            if (this.typedArray[i] !== 0) {
                return false;
            }
        }
        return true;
    }

    copyWithin(target: number, start: number, end: number): void {
        this.dataView[this.arrayType].copyWithin(target * this.sizeInQuads, start * this.sizeInQuads, end * this.sizeInQuads);
    }

    slice(start = 0, end = this._capacity): ArrayLike<Schema.ToType<S>> & Iterable<Schema.ToType<S>> {
        const result = new Array<Schema.ToType<S>>(Math.max(0, end - start));
        for (let i = start; i < end; i++) {
            result[i - start] = this.read(this.dataView, i);
        }
        return result;
    }

    copy(): TypedBuffer<Schema.ToType<S>> {
        // A copy is a detached snapshot backed by its own (default-allocated)
        // buffer, not a view into the source's shared arena.
        const copy = new StructTypedBuffer<S, ArrayType>(this.schema as S, this._capacity);
        const src = this.allocator.refresh(this.region);
        copy.region.set(src.subarray(0, this._capacity * this.sizeInQuads));
        return copy;
    }
}

export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    initialCapacity: number,
    allocator?: MemoryAllocator,
): TypedBuffer<Schema.ToType<S>>
export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    arrayBuffer: ArrayBuffer,
): TypedBuffer<Schema.ToType<S>>
export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    initialCapacityOrArrayBuffer: number | ArrayBuffer,
    allocator?: MemoryAllocator,
): TypedBuffer<Schema.ToType<S>> {
    return new StructTypedBuffer<S, ArrayType>(schema, initialCapacityOrArrayBuffer, allocator);
}
