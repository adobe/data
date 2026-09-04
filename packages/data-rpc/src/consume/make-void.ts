// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";
import type { CallerContext } from "./caller-context.js";

/**
 * Projects a remote void member: fire-and-forget `send`, no reply. A throw inside
 * the host handler has no wire channel back here — it is routed to the host
 * endpoint's `onError`.
 *
 * NOTE: observe-bearing arguments to a void member cannot be released (there is
 * no completion signal), so their providers live until the endpoint closes.
 * Prefer a promise/observe/generator member when passing observe arguments.
 */
export function makeVoid(
    ctx: CallerContext,
    service: string,
    path: readonly string[],
    args: readonly unknown[],
    params?: readonly Schema[],
): void {
    if (ctx.isClosed()) return;
    const id = ctx.nextId();
    ctx.send({ kind: "send", id, service, path, args: ctx.marshalArgs(args, params, id) });
}
