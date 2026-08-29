// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createTypedBuffer, TypedBuffer } from "../typed-buffer/index.js";
import { Schema } from "../schema/index.js";
import { Table } from "./table.js";
import { MemoryAllocator } from "../cache/memory-allocator.js";

export const createTable = <C extends Record<string, Schema>>(schemas: C, allocator?: MemoryAllocator) : Table<{ [K in keyof C]: Schema.ToType<C[K]> }> => {
    const columns = {} as { [K in keyof C]: TypedBuffer<Schema.ToType<C[K]>> };
    const rowCapacity = 16;
    for (const name in schemas) {
        columns[name] = createTypedBuffer(schemas[name], rowCapacity, allocator);
    }

    return {
        columns,
        rowCount: 0,
        rowCapacity,
    };
}