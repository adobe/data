// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../../math/index.js";
import type { Schema } from "../../../schema/index.js";
import { createTypedBuffer } from "../../../typed-buffer/create-typed-buffer.js";
import type { Volume } from "../volume.js";
import { DenseVolume } from "./dense-volume.js";

const expectedCapacity = (size: Vec3): number => size[0] * size[1] * size[2];

export const createDense = <S extends Schema & { default: Schema.ToType<S> }>(
    size: Vec3,
    schema: S,
): Volume<Schema.ToType<S>> => {
    const data = createTypedBuffer(schema, expectedCapacity(size));
    return new DenseVolume(size, data);
};
