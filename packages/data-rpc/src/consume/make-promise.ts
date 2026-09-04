// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Schema } from "@adobe/data/schema";
import type { CallerContext, CallSlot } from "./caller-context.js";

/**
 * Projects a remote promise member: allocates an id, marshals any observe-bearing
 * args, registers a pending slot, and sends `call`; the endpoint settles the slot
 * from the matching `resolve`/`reject` and releases the arg-observe providers.
 * When `defaultTimeoutMs` is set, a timer rejects the call (and releases providers)
 * if no reply arrives — the host still runs to completion, but a wedged transport
 * no longer hangs forever.
 */
export function makePromise(
    ctx: CallerContext,
    service: string,
    path: readonly string[],
    args: readonly unknown[],
    params?: readonly Schema[],
): Promise<Data> {
    const label = `${service}.${path.join(".")}`;
    return new Promise<Data>((resolve, reject) => {
        if (ctx.isClosed()) {
            reject(new Error(`rpc endpoint is closed (${label})`));
            return;
        }
        const id = ctx.nextId();
        const wireArgs = ctx.marshalArgs(args, params, id);
        const slot: CallSlot = { resolve, reject };
        const deadline =
            ctx.defaultTimeoutMs !== undefined ? Date.now() + ctx.defaultTimeoutMs : undefined;
        if (ctx.defaultTimeoutMs !== undefined) {
            slot.timer = setTimeout(() => {
                if (ctx.callPending.delete(id)) {
                    ctx.releaseArgRefs(id);
                    reject(new Error(`rpc call ${label} timed out after ${ctx.defaultTimeoutMs}ms`));
                }
            }, ctx.defaultTimeoutMs);
        }
        ctx.callPending.set(id, slot);
        ctx.send({ kind: "call", id, service, path, args: wireArgs, deadline });
    });
}
