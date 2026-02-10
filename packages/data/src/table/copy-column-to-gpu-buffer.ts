// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Table } from "./table.js";

/**
 * Copies a column from an array of tables to a GPU buffer.
 */
export const copyColumnToGPUBuffer = <T extends Table<any>, K extends keyof T["columns"]>(
    tables: readonly T[],
    columnName: K,
    device: GPUDevice,
    gpuBuffer: GPUBuffer,
): GPUBuffer => {
    // get total byte length
    let totalByteLength = 0;
    for (const table of tables) {
        totalByteLength += table.rowCount * table.columns[columnName].typedArrayElementSizeInBytes;
    }
    // ensure the gpu buffer is large enough
    if (gpuBuffer.size < totalByteLength) {
        gpuBuffer.destroy();
        gpuBuffer = device.createBuffer({ size: totalByteLength, usage: gpuBuffer.usage });
    }
    // copy all columns to the gpu buffer while incrementing the offset
    let offset = 0;
    for (const table of tables) {
        const column = table.columns[columnName];
        const writeByteLength = table.rowCount * column.typedArrayElementSizeInBytes;
        const array = column.getTypedArray();
        device.queue.writeBuffer(gpuBuffer, offset, array.buffer, 0, writeByteLength);
        offset += writeByteLength;
    }
    return gpuBuffer;
}