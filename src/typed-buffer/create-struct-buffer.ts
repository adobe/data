// © 2026 Adobe. MIT License. See /LICENSE for details.
import { resize } from "../internal/array-buffer-like/resize.js";
import { DataView32 } from "../internal/data-view-32/data-view-32.js";
import { createDataView32 } from "../internal/data-view-32/create-data-view-32.js";
import { Schema } from "../schema/index.js";
import { createReadStruct } from "./structs/create-read-struct.js";
import { createWriteStruct } from "./structs/create-write-struct.js";
import { getStructLayout } from "./structs/get-struct-layout.js";
import { TypedBuffer, TypedBufferType } from "./typed-buffer.js";
import { TypedArray } from "../internal/typed-array/index.js";
import { createSharedArrayBuffer } from "../internal/shared-array-buffer/create-shared-array-buffer.js";

export const structBufferType = "struct";

class StructTypedBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32"> extends TypedBuffer<Schema.ToType<S>> {
    public readonly type: TypedBufferType = structBufferType;
    public readonly typedArrayElementSizeInBytes: number;
    
    private arrayBuffer: ArrayBuffer | SharedArrayBuffer;
    private dataView: DataView32;
    private typedArray: TypedArray;
    private readonly layout: NonNullable<ReturnType<typeof getStructLayout>>;
    private readonly read: ReturnType<typeof createReadStruct<Schema.ToType<S>>>;
    private readonly write: ReturnType<typeof createWriteStruct<Schema.ToType<S>>>;
    private readonly sizeInQuads: number;
    private readonly arrayType: ArrayType;
    private _capacity: number;

    constructor(schema: S, initialCapacityOrArrayBuffer: number | ArrayBuffer) {
        super(schema);
        
        const structLayout = getStructLayout(schema);
        if (!structLayout) {
            throw new Error("Schema is not a valid struct schema");
        }
        
        this.layout = structLayout;
        this.typedArrayElementSizeInBytes = this.layout.size;
        this.arrayType = 'f32' as ArrayType;
        this.sizeInQuads = this.layout.size / 4;
        
        this.arrayBuffer
            = initialCapacityOrArrayBuffer instanceof ArrayBuffer
            ? initialCapacityOrArrayBuffer
            : createSharedArrayBuffer(initialCapacityOrArrayBuffer * this.layout.size);
        this.dataView = createDataView32(this.arrayBuffer);
        this.typedArray = this.dataView[this.arrayType];
        this._capacity = this.typedArray.length / this.sizeInQuads;
        
        this.read = createReadStruct<Schema.ToType<S>>(this.layout);
        this.write = createWriteStruct<Schema.ToType<S>>(this.layout);
    }

    get capacity(): number {
        return this._capacity;
    }

    set capacity(value: number) {
        if (value !== this._capacity) {
            this._capacity = value;
            this.arrayBuffer = resize(this.arrayBuffer, value * this.layout.size);
            this.dataView = createDataView32(this.arrayBuffer);
            this.typedArray = this.dataView[this.arrayType];
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
        const byteLength = this._capacity * this.layout.size;
        const newArrayBuffer = new ArrayBuffer(byteLength);
        // Copy underlying f32 data (structs are packed as float32 quads)
        const dst = new Float32Array(newArrayBuffer);
        const src = this.dataView[this.arrayType];
        dst.set(src.subarray(0, this._capacity * this.sizeInQuads));
        return new StructTypedBuffer<S, ArrayType>(this.schema as S, newArrayBuffer);
    }
}

export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    initialCapacity: number,
): TypedBuffer<Schema.ToType<S>>
export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    arrayBuffer: ArrayBuffer,
): TypedBuffer<Schema.ToType<S>>
export function createStructBuffer<S extends Schema, ArrayType extends keyof DataView32 = "f32">(
    schema: S,
    initialCapacityOrArrayBuffer: number | ArrayBuffer,
): TypedBuffer<Schema.ToType<S>> {
    return new StructTypedBuffer<S, ArrayType>(schema, initialCapacityOrArrayBuffer);
}
