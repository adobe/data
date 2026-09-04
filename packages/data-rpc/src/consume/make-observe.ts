// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import type { CallerContext } from "./caller-context.js";

/**
 * A local `Observe<Data>` that projects a remote observe member. On subscribe it
 * allocates an id, marshals any observe-bearing args, registers the `notify`, and
 * sends `subscribe`; each remote `next` for that id is routed back to `notify` by
 * the endpoint. Unsubscribing deletes the id (so any `next` still in flight is
 * dropped), sends `unsubscribe`, and releases any arg-observe providers.
 *
 * Unlike a local `Observe` (e.g. `Observe.fromConstant`, which notifies
 * synchronously on subscribe), the FIRST value here necessarily arrives
 * asynchronously — it is a round-trip over the transport.
 */
export function makeObserve(
    ctx: CallerContext,
    service: string,
    path: readonly string[],
    args: readonly unknown[],
    params?: readonly Schema[],
): Observe<Data> {
    return (notify) => {
        if (ctx.isClosed()) return () => undefined;
        const id = ctx.nextId();
        const wireArgs = ctx.marshalArgs(args, params, id);
        ctx.callerSubs.set(id, notify);
        ctx.send({ kind: "subscribe", id, service, path, args: wireArgs });
        return () => {
            if (ctx.callerSubs.delete(id)) {
                ctx.send({ kind: "unsubscribe", id });
            }
            ctx.releaseArgRefs(id);
        };
    };
}
