// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Notify, Observe, Unobserve } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import type { Service } from "@adobe/data/service";
import { marshalArgsWith, unmarshalArgsWith } from "./arg-marshal.js";
import type { CallerContext, CallSlot, CallerGenSlot, PullResult } from "./consume/caller-context.js";
import { reconstructError } from "./consume/reconstruct-error.js";
import { marshalError } from "./host/marshal-error.js";
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

    // ---- argument-constructor state (REVERSE channel: an Observe/Promise/
    //      AsyncGenerator passed as/inside a call argument is serviced from THIS
    //      side, as caller, and reconstructed on THIS side, as callee) ----
    // Caller role — providers we service on the peer's demand, keyed by our ref:
    const argObserveProviders = new Map<number, Observe<Data>>();
    const argObserveSubs = new Map<number, { unobserve: Unobserve; ref: number }>(); // sub → callee's live subscription
    const argPromiseProviders = new Set<number>(); // refs whose promise is still pending
    const argGenProviders = new Map<number, AsyncGenerator<Data>>();
    const callArgRefs = new Map<number, Set<number>>(); // opId → arg refs to release when the op ends
    // Callee role — local reconstructions of the peer's arg constructors, keyed by ref:
    const hostArgObserveSubs = new Map<number, Notify<Data>>(); // sub → our notify for a remote arg observe
    const argPromiseWaiters = new Map<number, { resolve: (value: Data) => void; reject: (error: unknown) => void }>();
    const argGenSlots = new Map<number, CallerGenSlot>();

    const trackRef = (opId: number, ref: number) => {
        let refs = callArgRefs.get(opId);
        if (refs === undefined) {
            refs = new Set();
            callArgRefs.set(opId, refs);
        }
        refs.add(ref);
    };

    const marshalArgs = (args: readonly unknown[], params: readonly Schema[] | undefined, opId: number): Data[] =>
        marshalArgsWith(args, params, {
            observe: (obs) => {
                const ref = nextId();
                argObserveProviders.set(ref, obs);
                trackRef(opId, ref);
                return ref;
            },
            promise: (promise) => {
                const ref = nextId();
                argPromiseProviders.add(ref);
                trackRef(opId, ref);
                void promise.then(
                    (value) => { if (argPromiseProviders.delete(ref)) send({ kind: "arg-resolve", ref, value: value === undefined ? null : value }); },
                    (error) => { if (argPromiseProviders.delete(ref)) send({ kind: "arg-reject", ref, error: marshalError(error) }); },
                );
                return ref;
            },
            generator: (generator) => {
                const ref = nextId();
                argGenProviders.set(ref, generator);
                trackRef(opId, ref);
                return ref;
            },
        });

    const releaseArgRefs = (opId: number): void => {
        const refs = callArgRefs.get(opId);
        if (refs === undefined) return;
        callArgRefs.delete(opId);
        for (const ref of refs) {
            argObserveProviders.delete(ref);
            for (const [sub, entry] of argObserveSubs) {
                if (entry.ref === ref) {
                    entry.unobserve();
                    argObserveSubs.delete(sub);
                }
            }
            argPromiseProviders.delete(ref);
            const gen = argGenProviders.get(ref);
            if (gen !== undefined) {
                argGenProviders.delete(ref);
                void gen.return(undefined).catch(() => undefined);
            }
        }
    };

    // Callee-role reconstruction of a remote arg-generator: pull-based, keyed by ref.
    const makeArgGenerator = (ref: number): AsyncGenerator<Data> => {
        const slot: CallerGenSlot = { pulls: [] };
        argGenSlots.set(ref, slot);
        let finished = false;
        const finish = () => {
            finished = true;
            argGenSlots.delete(ref);
        };
        const gen: AsyncGenerator<Data> = {
            async next(): Promise<IteratorResult<Data>> {
                if (finished || closed) {
                    finish();
                    return { done: true, value: undefined };
                }
                send({ kind: "arg-pull", ref });
                const result = await new Promise<PullResult>((res) => slot.pulls.push(res));
                if ("error" in result) { finish(); throw result.error; }
                if (result.done) { finish(); return { done: true, value: result.value }; }
                return { done: false, value: result.value };
            },
            async return(value?: Data): Promise<IteratorResult<Data>> {
                if (!finished) { finish(); send({ kind: "arg-return", ref }); }
                return { done: true, value: value as Data };
            },
            async throw(error?: unknown): Promise<IteratorResult<Data>> {
                if (!finished) { finish(); send({ kind: "arg-raise", ref, error: marshalError(error) }); }
                throw error;
            },
            [Symbol.asyncIterator]() { return this; },
            async [Symbol.asyncDispose](): Promise<void> { await gen.return(undefined); },
        };
        return gen;
    };

    const unmarshalArgs = (args: readonly Data[], params: readonly Schema[] | undefined): unknown[] =>
        unmarshalArgsWith(args, params, {
            observe: (ref) => (notify) => {
                const sub = nextId();
                hostArgObserveSubs.set(sub, notify);
                send({ kind: "arg-subscribe", ref, sub });
                return () => {
                    if (hostArgObserveSubs.delete(sub)) send({ kind: "arg-unsubscribe", sub });
                };
            },
            promise: (ref) => new Promise<Data>((resolve, reject) => argPromiseWaiters.set(ref, { resolve, reject })),
            generator: (ref) => makeArgGenerator(ref),
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
                const provider = argObserveProviders.get(msg.ref);
                if (provider === undefined) return; // ref already released / unknown
                const unobserve = provider((value) => send({ kind: "arg-next", sub: msg.sub, value }));
                argObserveSubs.set(msg.sub, { unobserve, ref: msg.ref });
                return;
            }
            case "arg-next": {
                // We are the CALLEE: a value arrived for a remote arg observe we subscribed to.
                hostArgObserveSubs.get(msg.sub)?.(msg.value);
                return;
            }
            case "arg-unsubscribe": {
                // We are the CALLER: the callee unsubscribed from an arg observe.
                const entry = argObserveSubs.get(msg.sub);
                if (entry !== undefined) {
                    entry.unobserve();
                    argObserveSubs.delete(msg.sub);
                }
                return;
            }
            // ---- reverse channel: argument promises ----
            case "arg-resolve": {
                // We are the CALLEE: a remote arg promise settled.
                const waiter = argPromiseWaiters.get(msg.ref);
                if (waiter !== undefined) {
                    argPromiseWaiters.delete(msg.ref);
                    waiter.resolve(msg.value);
                }
                return;
            }
            case "arg-reject": {
                const waiter = argPromiseWaiters.get(msg.ref);
                if (waiter !== undefined) {
                    argPromiseWaiters.delete(msg.ref);
                    waiter.reject(reconstructError(msg.error));
                }
                return;
            }
            // ---- reverse channel: argument generators ----
            case "arg-pull": {
                // We are the CALLER: the callee pulled the next value from an arg generator.
                const gen = argGenProviders.get(msg.ref);
                if (gen === undefined) return;
                gen.next().then(
                    (result) => {
                        if (result.done) {
                            argGenProviders.delete(msg.ref);
                            send({ kind: "arg-done", ref: msg.ref, value: result.value ?? undefined });
                        } else {
                            send({ kind: "arg-yield", ref: msg.ref, value: result.value });
                        }
                    },
                    (error) => {
                        argGenProviders.delete(msg.ref);
                        send({ kind: "arg-throw", ref: msg.ref, error: marshalError(error) });
                    },
                );
                return;
            }
            case "arg-yield":
            case "arg-done":
            case "arg-throw": {
                // We are the CALLEE: a pull on a remote arg generator was answered.
                const slot = argGenSlots.get(msg.ref);
                const resolvePull = slot?.pulls.shift();
                if (resolvePull === undefined) return;
                if (msg.kind === "arg-yield") resolvePull({ done: false, value: msg.value });
                else if (msg.kind === "arg-done") resolvePull({ done: true, value: msg.value });
                else resolvePull({ error: reconstructError(msg.error) });
                return;
            }
            case "arg-return": {
                // We are the CALLER: the callee ended an arg generator early.
                const gen = argGenProviders.get(msg.ref);
                argGenProviders.delete(msg.ref);
                void gen?.return(undefined).catch((error) => onError(error));
                return;
            }
            case "arg-raise": {
                const gen = argGenProviders.get(msg.ref);
                argGenProviders.delete(msg.ref);
                void gen?.throw(reconstructError(msg.error)).catch(() => undefined);
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
        // Reverse channel: release every arg-constructor provider and reconstruction.
        for (const [, entry] of argObserveSubs) entry.unobserve();
        argObserveSubs.clear();
        argObserveProviders.clear();
        argPromiseProviders.clear();
        for (const [, gen] of argGenProviders) void gen.return(undefined).catch(() => undefined);
        argGenProviders.clear();
        callArgRefs.clear();
        hostArgObserveSubs.clear();
        for (const [, waiter] of argPromiseWaiters) waiter.reject(new Error("data-rpc endpoint closed"));
        argPromiseWaiters.clear();
        for (const [, slot] of argGenSlots) {
            for (const resolvePull of slot.pulls.splice(0)) resolvePull({ done: true, value: undefined });
        }
        argGenSlots.clear();
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
