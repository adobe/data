// © 2026 Adobe. MIT License. See /LICENSE for details.

import { BlobRef } from "./blob-store.js";
import { Schema } from "../schema/index.js";
import { Nullable } from "../schema/nullable.js";
import type { Assert } from "../types/assert.js";
import type { Equal } from "../types/equal.js";

/**
 * The namespaced `BlobRef` exposes `schema` and `is` under the type's own name,
 * so consumers reach them without importing the standalone `BlobRefSchema` /
 * `isBlobRef` — mirroring `BlobHandle` / `BlobMeta`.
 */

// `BlobRef.schema` is a Schema whose `ToType` is exactly `BlobRef`.
type _SchemaMatchesType = Assert<Equal<Schema.ToType<typeof BlobRef.schema>, BlobRef>>;

// `BlobRef.is` is the type guard.
function narrows(value: unknown) {
    if (BlobRef.is(value)) {
        const _ok: BlobRef = value;
    }
}

// An ECS component that stores a BlobRef has no natural empty value; the honest
// model is a nullable column with a `null` default — no `as unknown as` cast.
const imageComponent = { ...Nullable(BlobRef.schema), default: null } as const;
type _NullableType = Assert<Equal<
    Schema.ToType<typeof imageComponent>,
    BlobRef | null
>>;
