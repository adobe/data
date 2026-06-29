// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import { createTypedBuffer } from "../../../typed-buffer/create-typed-buffer.js";
import type { Volume } from "../volume.js";
import { normalizeBlockSize } from "./block-dims.js";
import { SparseBlockVolume } from "./sparse-block-volume.js";

export const createSparseBlock = <S extends Schema & { default: Schema.ToType<S> }>(
    schema: S,
    blockSize: number | Vec3 = 16,
): Volume<Schema.ToType<S>> => {
    const data = createTypedBuffer(schema, 0);
    return new SparseBlockVolume(normalizeBlockSize(blockSize), data);
};
