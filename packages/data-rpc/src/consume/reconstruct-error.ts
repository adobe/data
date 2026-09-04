// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RpcError } from "../protocol.js";

/**
 * Rebuild a local `Error` from a wire {@link RpcError}. The result is always a
 * plain `Error` (the remote subclass is not reconstructable); `name` and the
 * remote `stack` are preserved so logs point back at the true origin.
 */
export function reconstructError(error: RpcError): Error {
    const e = new Error(error.message);
    e.name = error.name;
    if (error.stack !== undefined) e.stack = error.stack;
    return e;
}
