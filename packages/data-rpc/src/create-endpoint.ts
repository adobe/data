// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Notify, Observe, Unobserve } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import type { Service } from "@adobe/data/service";
import { marshalArgsWith, unmarshalArgsWith } from "./arg-observe.js";
import type { CallerContext, CallSlot, CallerGenSlot } from "./consume/caller-context.js";
import { reconstructError } from "./consume/reconstruct-error.js";
import { synthesizeService } from "./consume/synthesize-service.js";
import type { RpcEndpoint, RpcEndpointOptions } from "./endpoint.js";
import type { ExposedService, HostContext } from "./host/host-context.js";
import { handleHostRequest } from "./host/register-service.js";
import { createIdAllocator } from "./id.js";
import { RPC_PROTOCOL_VERSION, type RpcMessage } from "./protocol.js";
import type { RpcTransport } from "./transport.js";

/**
 * Create a bidirectional RPC endpoint over `transport`. Sends a `hello`
 * handshake immediately; re-announces exposed services whenever the peer says
 * `hello`, so services exposed before the peer connected are still discovered.
 */
export function createRpcEndpoint(transport: RpcTransport, options: RpcEndpointOptions = {}): RpcEndpoint {
    const nextId = createIdAllocator();
    const canInvoke = options.canInvoke ?? (() => true);
    const onError = options.onError ?? ((error: unknown) => console.error("[data-rpc]", error));

    let closed = false;
    const send = (msg: RpcMessage) => {
        if (!closed) transport.send(msg);
    };

    // ---- argument-observe state (REVERSE channel: an Observe passed as/inside a
    //      call argument streams from THIS side, as caller, back to the callee) ----
    const argProviders = new Map<number, Observe<Data>>(); // ref → our local arg observe
    const argProviderSubs = new Map<number, { unobserve: Unobserve; ref: number }>(); // sub → the callee's live subscription to it
    const callArgRefs = new Map<number, Set<number>>(); // opId → arg refs to release when the op ends
    const hostArgSubs = new Map<number, Notify<Data>>(); // sub → our (as callee) notify for a remote arg observe

    const marshalArgs = (args: readonly unknown[], params: readonly Schema[] | undefined, opId: number): Data[] =>
        marshalArgsWith(args, params, (obs) => {
            const ref = nextId();
            argProviders.set(ref, obs);
            let refs = callArgRefs.get(opId);
            if (refs === undefined) {
                refs = new Set();
                callArgRefs.set(opId, refs);
            }
            refs.add(ref);
            return ref;
        });

    const releaseArgRefs = (opId: number): void => {
        const refs = callArgRefs.get(opId);
        if (refs === undefined) return;
        callArgRefs.delete(opId);
        for (const ref of refs) {
            argProviders.delete(ref);
            for (const [sub, entry] of argProviderSubs) {
                if (entry.ref === ref) {
                    entry.unobserve();
                    argProviderSubs.delete(sub);
                }
            }
        }
    };

    const unmarshalArgs = (args: readonly Data[], params: readonly Schema[] | undefined): unknown[] =>
        unmarshalArgsWith(args, params, (ref) => (notify) => {
            const sub = nextId();
            hostArgSubs.set(sub, notify);
            send({ kind: "arg-subscribe", ref, sub });
            return () => {
                if (hostArgSubs.delete(sub)) send({ kind: "arg-unsubscribe", sub });
            };
        });

    // ---- host-side state (keyed by the REMOTE caller's id) ----
    const exposed = new Map<string, ExposedService>();
    const hostSubs = new Map<number, Unobserve>();
    const hostGens = new Map<number, AsyncGenerator<Data>>();
    const hostCtx: HostContext = { send, exposed, hostSubs, hostGens, canInvoke, onError, unmarshalArgs };

    // ---- caller-side state (keyed by a LOCAL id) ----
    const callPending = new Map<number, CallSlot>();
    const callerSubs = new Map<number, Notify<Data>>();
    const callerGens = new Map<number, CallerGenSlot>();
    const schemaPending = new Map<number, (schema: Schema | null) => void>();
    const availableSchemas = new Map<string, Schema>();
    const awaiting = new Map<string, Array<(schema: Schema) => void>>();
    const callerCtx: CallerContext = {
        send,
        nextId,
        callPending,
        callerSubs,
        callerGens,
        defaultTimeoutMs: options.defaultTimeoutMs,
        isClosed: () => closed,
        marshalArgs,
        releaseArgRefs,
    };

    const flushAwaiting = (name: string, schema: Schema) => {
        const waiters = awaiting.get(name);
        if (waiters === undefined) return;
        awaiting.delete(name);
        for (const w of waiters) w(schema);
    };

    // ---- dispatcher ----
    const unMessage = transport.onMessage((msg) => {
        switch (msg.kind) {
            case "hello": {
                send({ kind: "welcome", protocol: RPC_PROTOCOL_VERSION });
                // Re-announce everything already exposed for a peer that connected late.
                for (const [name, ex] of exposed) send({ kind: "available", service: name, schema: ex.schema });
                return;
            }
            case "welcome": {
                if (msg.protocol !== RPC_PROTOCOL_VERSION) {
                    onError(new Error(`data-rpc protocol mismatch: local ${RPC_PROTOCOL_VERSION}, peer ${msg.protocol}`));
                }
                return;
            }
            case "available": {
                availableSchemas.set(msg.service, msg.schema);
                flushAwaiting(msg.service, msg.schema);
                return;
            }
            case "unavailable": {
                availableSchemas.delete(msg.service);
                return;
            }
            case "schema": {
                const waiter = schemaPending.get(msg.id);
                if (waiter !== undefined) {
                    schemaPending.delete(msg.id);
                    waiter(msg.schema);
                }
                return;
            }
            case "resolve": {
                const slot = callPending.get(msg.id);
                if (slot !== undefined) {
                    if (slot.timer !== undefined) clearTimeout(slot.timer);
                    callPending.delete(msg.id);
                    releaseArgRefs(msg.id);
                    slot.resolve(msg.value);
                }
                return;
            }
            case "reject": {
                const slot = callPending.get(msg.id);
                if (slot !== undefined) {
                    if (slot.timer !== undefined) clearTimeout(slot.timer);
                    callPending.delete(msg.id);
                    releaseArgRefs(msg.id);
                    slot.reject(reconstructError(msg.error));
                }
                return;
            }
            case "next": {
                callerSubs.get(msg.id)?.(msg.value);
                return;
            }
            case "yield":
            case "done":
            case "throw": {
                const slot = callerGens.get(msg.id);
                const resolvePull = slot?.pulls.shift();
                if (resolvePull === undefined) return;
                if (msg.kind === "yield") resolvePull({ done: false, value: msg.value });
                else if (msg.kind === "done") resolvePull({ done: true, value: msg.value });
                else resolvePull({ error: reconstructError(msg.error) });
                return;
            }
            // ---- reverse channel: argument observes ----
            case "arg-subscribe": {
                // We are the CALLER: the callee wants to observe an arg we sent.
                const provider = argProviders.get(msg.ref);
                if (provider === undefined) return; // ref already released / unknown
                const unobserve = provider((value) => send({ kind: "arg-next", sub: msg.sub, value }));
                argProviderSubs.set(msg.sub, { unobserve, ref: msg.ref });
                return;
            }
            case "arg-next": {
                // We are the CALLEE: a value arrived for a remote arg observe we subscribed to.
                hostArgSubs.get(msg.sub)?.(msg.value);
                return;
            }
            case "arg-unsubscribe": {
                // We are the CALLER: the callee unsubscribed from an arg observe.
                const entry = argProviderSubs.get(msg.sub);
                if (entry !== undefined) {
                    entry.unobserve();
                    argProviderSubs.delete(msg.sub);
                }
                return;
            }
            default:
                // A request kind — route to the host side.
                handleHostRequest(hostCtx, msg);
                return;
        }
    });

    const teardown = () => {
        if (closed) return;
        closed = true;
        // Caller side: pending calls reject; observes drop (no error channel);
        // generators end gracefully (pending pulls resolve `done`).
        for (const [, slot] of callPending) {
            if (slot.timer !== undefined) clearTimeout(slot.timer);
            slot.reject(new Error("data-rpc endpoint closed"));
        }
        callPending.clear();
        callerSubs.clear();
        for (const [, slot] of callerGens) {
            for (const resolvePull of slot.pulls.splice(0)) resolvePull({ done: true, value: undefined });
        }
        callerGens.clear();
        for (const [, waiter] of schemaPending) waiter(null);
        schemaPending.clear();
        awaiting.clear();
        // Host side: release every subscription and generator.
        for (const [, unobserve] of hostSubs) unobserve();
        hostSubs.clear();
        for (const [, gen] of hostGens) void gen.return(undefined).catch(() => undefined);
        hostGens.clear();
        // Reverse channel: release every arg-observe provider and subscription.
        for (const [, entry] of argProviderSubs) entry.unobserve();
        argProviderSubs.clear();
        argProviders.clear();
        callArgRefs.clear();
        hostArgSubs.clear();
        unMessage();
    };
    transport.onClose(teardown);

    // Initiate the handshake.
    send({ kind: "hello", protocol: RPC_PROTOCOL_VERSION });

    const expose: RpcEndpoint["expose"] = (name, service, schema) => {
        // The type gate proves `schema` exactly describes `service`; store the plain schema.
        const plainSchema = schema as Schema;
        exposed.set(name, { service, schema: plainSchema });
        send({ kind: "available", service: name, schema: plainSchema });
        return () => {
            if (exposed.delete(name)) send({ kind: "unavailable", service: name });
        };
    };

    // Single implementation backing both `consume` overloads.
    function consume(name: string, schema?: Schema): unknown {
        if (schema !== undefined) {
            return synthesizeService(callerCtx, name, schema);
        }
        const known = availableSchemas.get(name);
        if (known !== undefined) {
            return Promise.resolve(synthesizeService(callerCtx, name, known));
        }
        return new Promise<Service>((resolve) => {
            const waiters = awaiting.get(name) ?? [];
            waiters.push((s) => resolve(synthesizeService(callerCtx, name, s)));
            awaiting.set(name, waiters);
            // Proactively fetch in case the service is exposed but we missed the
            // announcement (e.g. we connected after it was exposed).
            const id = nextId();
            schemaPending.set(id, (s) => {
                if (s !== null) {
                    availableSchemas.set(name, s);
                    flushAwaiting(name, s);
                }
                // s === null: not yet exposed — keep waiting for a future `available`.
            });
            send({ kind: "get-schema", id, service: name });
        });
    }

    return {
        expose,
        consume: consume as RpcEndpoint["consume"],
        close() {
            teardown();
            transport.close();
        },
    };
}
