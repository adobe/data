// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";

/** Options for {@link createRpcEndpoint}. */
export interface RpcEndpointOptions {
    /**
     * Authorization seam — return `false` to refuse a member call from the peer.
     * Defaults to allow-all. This is where per-member policy (e.g.
     * `Schema.resolveExternalInvocation`) drops in; it is SEPARATE from the
     * argument validation the host always performs against `signature.parameters`.
     */
    readonly canInvoke?: (service: string, member: string) => boolean;
    /**
     * If set, a consumed promise call rejects after this many ms with no reply,
     * so a wedged (but not closed) transport can't hang a call forever.
     */
    readonly defaultTimeoutMs?: number;
    /**
     * Receives errors that have no wire channel back to the caller — a throw in a
     * host `void` handler, a refused/failed `subscribe`, or a generator cleanup
     * failure. Defaults to `console.error`.
     */
    readonly onError?: (error: unknown) => void;
}

/**
 * A bidirectional RPC endpoint over one transport. Each endpoint can both
 * `expose` local services to the peer and `consume` the peer's services; the
 * channel is symmetric.
 */
export interface RpcEndpoint {
    /**
     * Expose a local service to the peer. The `schema` must be a valid
     * `AsyncDataService` schema that EXACTLY describes `service` — this is what
     * guarantees only `Data` ever crosses the wire; a mismatch is a compile
     * error carrying an `__rpcError` marker. Returns a teardown that stops new
     * calls (and announces the service unavailable).
     */
    expose<T extends Service, const S extends Schema>(
        name: string,
        service: T,
        schema: S &
            (AsyncDataService.IsValidWithCompleteSchema<T, S> extends true
                ? unknown
                : {
                      readonly __rpcError: "data-rpc: service must be a valid AsyncDataService fully described by this schema";
                  }),
    ): () => void;

    /**
     * Consume a peer service using a compile-time schema constant — returns a
     * fully-typed projected service synchronously. The returned type reflects
     * `Schema.ToType<S>` (deep-readonly, defaults widened), not necessarily the
     * peer's hand-authored interface.
     */
    consume<const S extends Schema>(name: string, schema: S): Schema.ToType<S> & Service;
    /**
     * Consume a peer service whose schema is fetched at runtime — resolves once
     * the peer has exposed it (safe to call before the peer exposes).
     */
    consume(name: string): Promise<Service>;

    /** Tear down the endpoint: reject pending calls, end subscriptions/generators, close the transport. */
    close(): void;
}
