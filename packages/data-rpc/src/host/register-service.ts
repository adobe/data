// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Observe } from "@adobe/data/observe";
import { validate, type Schema } from "@adobe/data/schema";
import { isPureDataSchema } from "../arg-marshal.js";
import { reconstructError } from "../consume/reconstruct-error.js";
import type { RpcError, RpcMessage } from "../protocol.js";
import type { HostContext } from "./host-context.js";
import { marshalError } from "./marshal-error.js";

// A member read off an exposed service. Its concrete shape (observe value vs.
// function returning observe/promise/generator/void) is guaranteed by the
// `IsValidWithCompleteSchema` gate at `expose()`, so we read it as a permissive
// callable/observable and dispatch by the request kind + member schema.
type Member =
    | Observe<Data>
    | ((...args: Data[]) => Observe<Data> | Promise<Data | void> | AsyncGenerator<Data> | void);

/**
 * Resolve an authorized, argument-validated member for an incoming request.
 * `path` addresses the member from the service root, walking through any nested
 * services. Returns the leaf member schema + callable, or an `RpcError`
 * describing why it was refused (service not exposed, member absent, not
 * permitted, or bad args).
 */
function resolve(
    ctx: HostContext,
    service: string,
    path: readonly string[],
    args: readonly Data[],
): { readonly memberSchema: Schema; readonly target: Member; readonly args: readonly unknown[] } | { readonly error: RpcError } {
    const label = `${service}.${path.join(".")}`;
    const exposed = ctx.exposed.get(service);
    if (exposed === undefined) {
        return { error: { name: "RpcError", message: `service "${service}" is not exposed` } };
    }
    if (path.length === 0) {
        return { error: { name: "RpcError", message: `empty member path for service "${service}"` } };
    }
    if (!ctx.canInvoke(service, path.join("."))) {
        return { error: { name: "RpcError", message: `"${label}" is not permitted` } };
    }
    // Walk the schema tree to the leaf member schema (through nested services).
    // Own-property checks only, so a wire path can never reach an inherited member
    // (e.g. `constructor`, `__proto__`) on the schema or the service object.
    let memberSchema: Schema = exposed.schema;
    for (const key of path) {
        const props = memberSchema.properties;
        if (props === undefined || !Object.prototype.hasOwnProperty.call(props, key)) {
            return { error: { name: "RpcError", message: `service "${service}" has no member "${label}"` } };
        }
        memberSchema = props[key];
    }
    const params = memberSchema.signature?.parameters;
    if (params !== undefined) {
        const errors: string[] = [];
        params.forEach((p, i) => {
            if (i >= args.length) errors.push(`missing required argument ${i} for "${label}"`);
            // Only pure-Data params are validated; a param that carries an observe
            // (an arg-observe ref on the wire) is not a validatable Data value.
            else if (isPureDataSchema(p)) errors.push(...validate(p, args[i]));
        });
        if (errors.length > 0) {
            return { error: { name: "RpcError", message: `invalid arguments for "${label}": ${errors.join("; ")}` } };
        }
    }
    // Walk the service object tree to the leaf member (own properties only).
    let target: unknown = exposed.service;
    for (const key of path) {
        if (target === null || typeof target !== "object" || !Object.prototype.hasOwnProperty.call(target, key)) {
            return { error: { name: "RpcError", message: `service "${service}" has no member "${label}"` } };
        }
        target = (target as Record<string, unknown>)[key];
    }
    // Reconstruct any arg-observes into local Observes that pull from the caller.
    const realArgs = ctx.unmarshalArgs(args, params);
    return { memberSchema, target: target as Member, args: realArgs };
}

/**
 * Handle one incoming REQUEST message against the host's exposed services.
 * Response/announcement kinds are handled elsewhere (the caller side); this
 * covers get-schema, call, send, subscribe/unsubscribe, and the pull-based
 * generator lifecycle. Returns `true` if the message was a host request it
 * handled, `false` otherwise (so the endpoint can route it to the caller side).
 */
export function handleHostRequest(ctx: HostContext, msg: RpcMessage): boolean {
    switch (msg.kind) {
        case "get-schema": {
            const exposed = ctx.exposed.get(msg.service);
            ctx.send({ kind: "schema", id: msg.id, service: msg.service, schema: exposed?.schema ?? null });
            return true;
        }

        case "call": {
            const r = resolve(ctx, msg.service, msg.path, msg.args);
            if ("error" in r) {
                ctx.send({ kind: "reject", id: msg.id, error: r.error });
                return true;
            }
            const fn = r.target as (...args: unknown[]) => Promise<Data | void>;
            Promise.resolve()
                .then(() => fn(...r.args))
                .then(
                    (value) => ctx.send({ kind: "resolve", id: msg.id, value: value === undefined ? null : value }),
                    (error) => ctx.send({ kind: "reject", id: msg.id, error: marshalError(error) }),
                );
            return true;
        }

        case "send": {
            const r = resolve(ctx, msg.service, msg.path, msg.args);
            if ("error" in r) {
                ctx.onError(reconstructError(r.error));
                return true;
            }
            // A void member's throw has no wire channel — surface it via onError.
            try {
                (r.target as (...args: unknown[]) => void)(...r.args);
            } catch (error) {
                ctx.onError(error);
            }
            return true;
        }

        case "subscribe": {
            const r = resolve(ctx, msg.service, msg.path, msg.args);
            if ("error" in r) {
                // An observe has no error channel — surface the refusal via onError.
                ctx.onError(reconstructError(r.error));
                return true;
            }
            const observe: Observe<Data> =
                r.memberSchema.type === "observe"
                    ? (r.target as Observe<Data>)
                    : (r.target as (...args: unknown[]) => Observe<Data>)(...r.args);
            const unobserve = observe((value) => ctx.send({ kind: "next", id: msg.id, value }));
            ctx.hostSubs.set(msg.id, unobserve);
            return true;
        }

        case "unsubscribe": {
            ctx.hostSubs.get(msg.id)?.();
            ctx.hostSubs.delete(msg.id);
            return true;
        }

        case "iterate": {
            const r = resolve(ctx, msg.service, msg.path, msg.args);
            if ("error" in r) {
                ctx.send({ kind: "throw", id: msg.id, error: r.error });
                return true;
            }
            const gen = (r.target as (...args: unknown[]) => AsyncGenerator<Data>)(...r.args);
            ctx.hostGens.set(msg.id, gen);
            return true;
        }

        case "pull": {
            const gen = ctx.hostGens.get(msg.id);
            if (gen === undefined) return true; // already returned / never iterated
            gen.next().then(
                (result) => {
                    if (result.done) {
                        ctx.hostGens.delete(msg.id);
                        ctx.send({ kind: "done", id: msg.id, value: result.value ?? undefined });
                    } else {
                        ctx.send({ kind: "yield", id: msg.id, value: result.value });
                    }
                },
                (error) => {
                    ctx.hostGens.delete(msg.id);
                    ctx.send({ kind: "throw", id: msg.id, error: marshalError(error) });
                },
            );
            return true;
        }

        case "return": {
            const gen = ctx.hostGens.get(msg.id);
            ctx.hostGens.delete(msg.id);
            void gen?.return(undefined).catch((error) => ctx.onError(error));
            return true;
        }

        case "raise": {
            const gen = ctx.hostGens.get(msg.id);
            ctx.hostGens.delete(msg.id);
            void gen?.throw(reconstructError(msg.error)).catch(() => {
                // The injected error propagating back out is expected; swallow it.
            });
            return true;
        }

        default:
            return false;
    }
}
