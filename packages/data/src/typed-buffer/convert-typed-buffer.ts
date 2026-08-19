// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../schema/schema.js";
import { createCoerceFunction } from "../schema/create-coerce-function.js";
import { createTypedBuffer } from "./create-typed-buffer.js";
import { ReadonlyTypedBuffer, TypedBuffer } from "./typed-buffer.js";

/**
 * Convert `source` into a NEW buffer of `targetSchema`.
 *
 * The per-element conversion is compiled once via
 * {@link createCoerceFunction}(source.schema, targetSchema); if no automatic
 * conversion exists it **throws** — a developer error, callers that want to
 * probe first can call `createCoerceFunction` themselves and branch on `null`.
 *
 * `capacity` sizes the new buffer (default: the source's). `count` is how many
 * leading elements to actually convert (default: everything in range) — a table
 * passes its live `rowCount` so unused rows (which may hold `undefined` in an
 * array buffer) are not run through the coercer; those slots stay at the new
 * buffer's zero/default init.
 *
 * Source values are copied by reference into the new buffer (ECS component
 * values are never mutated in place); only newly-introduced fields get their own
 * cloned defaults. Width/precision loss (F64→F32, capped integers) is applied by
 * the destination buffer as coerced values are written.
 */
export function convertTypedBuffer(
    source: ReadonlyTypedBuffer<unknown>,
    targetSchema: Schema,
    capacity: number = source.capacity,
    count: number = Math.min(capacity, source.capacity),
): TypedBuffer<unknown> {
    const coerce = createCoerceFunction(source.schema, targetSchema);
    if (coerce === null) {
        throw new Error(
            `No automatic TypedBuffer conversion exists from ${JSON.stringify(source.schema)} to ${JSON.stringify(targetSchema)}.`,
        );
    }
    const target = createTypedBuffer(targetSchema, capacity);
    for (let i = 0; i < count; i++) {
        target.set(i, coerce(source.get(i)));
    }
    return target;
}
