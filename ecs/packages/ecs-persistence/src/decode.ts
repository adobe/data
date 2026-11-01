// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Failure } from "./failure.js";
import { decodeContents } from "./format/format.js";
import { contents } from "./program/contents.js";
import type { NamingTrait } from "./program/program.js";
import type { Snapshot } from "./snapshot.js";

/**
 * The snapshot `bytes` holds, read by the trait `by`, its columns of bytes viewed where they are in `bytes`, copied once
 * only when `bytes` doesn't start at a multiple of 8; or why it can't be read: it isn't one, `by` isn't a symbol, or it
 * names a component or resource the trait doesn't cover, or covers with another schema.
 */
export const decode = (bytes: Uint8Array, options: { readonly by: NamingTrait }): Snapshot | Failure => {
    const decoded = decodeContents(bytes, options.by);
    return "failure" in decoded ? decoded : { [contents]: decoded };
};
