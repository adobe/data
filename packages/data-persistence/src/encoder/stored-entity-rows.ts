// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Entity } from "@adobe/data/ecs";
import { createTypedBuffer, type TypedBuffer } from "@adobe/data/typed-buffer";

// Entity ids carry a generation in memory but are persisted in the 0.10.x form:
// an i32 with no generation, under an i32 entity schema. A column holding entity
// ids is therefore encoded through a buffer of its stored schema, and decoded
// back through one. Columns without entity ids never come here.

/** The bytes of `buffer`'s rows `rowStart .. rowStart + rowCount`, in their stored form. */
export const encodeStoredRows = (buffer: TypedBuffer<unknown>, rowStart: number, rowCount: number): ArrayBuffer => {
    const stored = createTypedBuffer(Entity.toStoredSchema(buffer.schema), rowCount);
    for (let row = 0; row < rowCount; row++) {
        stored.set(row, Entity.toStoredValue(buffer.get(rowStart + row), buffer.schema));
    }
    const view = stored.getTypedArray();
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
};

/** Writes stored-form `bytes` into `buffer` from `rowStart`, widening entity ids. */
export const decodeStoredRows = (buffer: TypedBuffer<unknown>, bytes: Uint8Array, rowStart: number): void => {
    const storedSchema = Entity.toStoredSchema(buffer.schema);
    const stride = createTypedBuffer(storedSchema, 1).typedArrayElementSizeInBytes;
    const rowCount = Math.min(Math.floor(bytes.byteLength / stride), buffer.capacity - rowStart);
    if (rowCount <= 0) return;
    const stored = createTypedBuffer(storedSchema, rowCount);
    const view = stored.getTypedArray();
    new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes.subarray(0, rowCount * stride));
    for (let row = 0; row < rowCount; row++) {
        buffer.set(rowStart + row, Entity.fromStoredValue(stored.get(row), storedSchema));
    }
};
