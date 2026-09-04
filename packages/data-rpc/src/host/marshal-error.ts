// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcError } from "../protocol.js";

/**
 * Serialize a thrown value into the three wire-safe fields of {@link RpcError}.
 * We never structured-clone the thrown value itself — that would drop its
 * subclass prototype and any non-standard properties, and a non-`Error` throw
 * (a string, an object) may not clone at all.
 */
export function marshalError(error: unknown): RpcError {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }
    // Non-Error throws (strings, plain objects): stringify into `message`.
    return { name: "Error", message: typeof error === "string" ? error : String(error) };
}
