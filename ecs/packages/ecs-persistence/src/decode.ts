// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Failure } from "./failure.js";
import { decodeContents } from "./format/format.js";
import { contents } from "./program/contents.js";
import type { Snapshot } from "./snapshot.js";

/**
 * The snapshot `bytes` holds, its columns of bytes viewed where they are in `bytes`, copied once only when `bytes`
 * doesn't start at a multiple of 8; or why it can't be read: it isn't one, or names a component or resource this
 * program doesn't persist, or persists with another schema.
 */
export const decode = (bytes: Uint8Array): Snapshot | Failure => {
    const decoded = decodeContents(bytes);
    return "failure" in decoded ? decoded : { [contents]: decoded };
};
