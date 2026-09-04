// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Unobserve } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import type { Service } from "@adobe/data/service";
import type { RpcMessage } from "../protocol.js";

/** One exposed service and the schema that describes (and validates) its surface. */
export interface ExposedService {
    readonly service: Service;
    readonly schema: Schema;
}

/**
 * The host-side surface the request handler operates on. `hostSubs`/`hostGens`
 * are keyed by the REMOTE caller's id (separate from the local caller tables),
 * so the same numeric id can be live in both directions without collision.
 */
export interface HostContext {
    readonly send: (msg: RpcMessage) => void;
    readonly exposed: Map<string, ExposedService>;
    readonly hostSubs: Map<number, Unobserve>;
    readonly hostGens: Map<number, AsyncGenerator<Data>>;
    readonly canInvoke: (service: string, member: string) => boolean;
    readonly onError: (error: unknown) => void;
    /**
     * Transform incoming args: reconstruct any arg-observe ref (guided by
     * `params`) into a local `Observe` that pulls values back from the caller.
     */
    readonly unmarshalArgs: (args: readonly Data[], params: readonly Schema[] | undefined) => unknown[];
}
