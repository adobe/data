// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { createTypedBuffer } from "../../../typed-buffer/create-typed-buffer.js";
import type { Volume } from "../volume.js";
import { SparseBlockVolume } from "./sparse-block-volume.js";

export const createSparseBlock = <S extends Schema & { default: Schema.ToType<S> }>(
    schema: S,
    blockSize = 16,
): Volume<Schema.ToType<S>> => {
    const data = createTypedBuffer(schema, 0);
    return new SparseBlockVolume(blockSize, data);
};
