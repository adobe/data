// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { CallerContext } from "./caller-context.js";

/**
 * Projects a remote void member: fire-and-forget `send`, no reply, no id table.
 * A throw inside the host handler has no wire channel back here — it is routed to
 * the host endpoint's `onError` and otherwise invisible to the caller (matching
 * the local `void`-member contract).
 */
export function makeVoid(
    ctx: CallerContext,
    service: string,
    path: readonly string[],
    args: readonly Data[],
): void {
    if (ctx.isClosed()) return;
    const id = ctx.nextId();
    ctx.send({ kind: "send", id, service, path, args });
}
