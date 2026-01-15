// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { createStructBuffer } from "./create-struct-buffer.js";
import { getStructLayout } from "./structs/get-struct-layout.js";
import { TypedBuffer } from "./typed-buffer.js";
import { createNumberBuffer } from "./create-number-buffer.js";
import { createArrayBuffer } from "./create-array-buffer.js";
import { createConstBuffer } from "./create-const-buffer.js";

export function createTypedBuffer <S extends Schema>(
    schema: S,
    initialCapacity?: number,
): TypedBuffer<Schema.ToType<S>>
export function createTypedBuffer <S extends Schema>(
    schema: S,
    initialValues: Schema.ToType<S>[]
): TypedBuffer<Schema.ToType<S>>
export function createTypedBuffer <S extends Schema>(
    schema: S,
    initialCapacityOrValues?: number | Schema.ToType<S>[],
): TypedBuffer<Schema.ToType<S>> {
    if (Array.isArray(initialCapacityOrValues)) {
        const buffer = createTypedBufferInternal<S>(schema, initialCapacityOrValues.length);
        for (let i = 0; i < initialCapacityOrValues.length; i++) {
            buffer.set(i, initialCapacityOrValues[i]);
        }
        return buffer;
    }
    return createTypedBufferInternal<S>(schema, initialCapacityOrValues ?? 16);
}

function createTypedBufferInternal <S extends Schema>(
    schema: S,
    initialCapacity: number,
): TypedBuffer<Schema.ToType<S>> {
    
    if (schema.const !== undefined) {
        return createConstBuffer(schema, initialCapacity) as TypedBuffer<Schema.ToType<S>>;
    }

    if (schema.type === 'number' || schema.type === 'integer') {
        return createNumberBuffer(schema, initialCapacity) as TypedBuffer<Schema.ToType<S>>;
    }

    // If schema has layout property, it should be treated as a struct layout
    const shouldBeStruct = schema.layout !== undefined;
    const structLayout = getStructLayout(schema, shouldBeStruct);
    if (structLayout) {
        return createStructBuffer(schema, initialCapacity);
    }

    return createArrayBuffer(schema, initialCapacity);
}
