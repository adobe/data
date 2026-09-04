// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Notify } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import type { RpcMessage } from "../protocol.js";

/** One in-flight promise call, awaiting a `resolve`/`reject` for its id. */
export interface CallSlot {
    readonly resolve: (value: Data) => void;
    readonly reject: (error: unknown) => void;
    timer?: ReturnType<typeof setTimeout>;
}

/** The result delivered to one awaited generator `pull`. */
export type PullResult =
    | { readonly done: false; readonly value: Data }
    | { readonly done: true; readonly value: Data | undefined }
    | { readonly error: Error };

/** One live consumed generator: a FIFO of pull resolvers awaiting yield/done/throw. */
export interface CallerGenSlot {
    readonly pulls: Array<(result: PullResult) => void>;
}

/**
 * The caller-side surface the consume wrappers write into. The endpoint owns
 * these tables and settles them from incoming response messages; the wrappers
 * only allocate an id, register a slot, and send a request. All tables are keyed
 * by a LOCAL id — unique per-originator, separate from the host-side tables.
 */
export interface CallerContext {
    readonly send: (msg: RpcMessage) => void;
    readonly nextId: () => number;
    readonly callPending: Map<number, CallSlot>;
    readonly callerSubs: Map<number, Notify<Data>>;
    readonly callerGens: Map<number, CallerGenSlot>;
    readonly defaultTimeoutMs?: number;
    readonly isClosed: () => boolean;
    /**
     * Transform outgoing args: replace any `Observe` (guided by `params`) with a
     * ref the caller streams back on demand, tracked under `opId` for cleanup.
     * Returns wire-safe `Data` args.
     */
    readonly marshalArgs: (args: readonly unknown[], params: readonly Schema[] | undefined, opId: number) => Data[];
    /** Release the arg-observe providers registered for `opId` (call/subscription done). */
    readonly releaseArgRefs: (opId: number) => void;
}
