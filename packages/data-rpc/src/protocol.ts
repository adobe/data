// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import type { Schema } from "@adobe/data/schema";

/**
 * The wire protocol for `@adobe/data-rpc`.
 *
 * Every payload that crosses the boundary is `Data` (JSON + Set/Map/Blob) — never
 * an `Observe`, `Promise`, `AsyncGenerator`, or function. The far side synthesizes
 * equivalent-shaped members locally; only their `Data` values travel. A service
 * gated on `AsyncDataService.IsValid` provably contains nothing else to marshal.
 *
 * The channel is symmetric: both endpoints originate requests. Direction is
 * implicit in the message `kind` — the request and response kind sets are
 * disjoint — so an `id` need only be unique per-originator. Each endpoint keeps
 * SEPARATE caller-side and host-side pending tables; the same numeric id may be
 * live in both directions at once with no cross-talk.
 */

/** Bumped when the wire shape changes incompatibly; peers exchange it in the handshake. */
export const RPC_PROTOCOL_VERSION = 1;

/**
 * Serialized form of a thrown value. We never structured-clone the thrown value
 * itself (that drops the subclass prototype and non-standard props); the host
 * captures these three fields and the caller reconstructs a plain `Error`.
 */
export interface RpcError {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
}

/** REQUEST kinds — always sent by the calling side toward the hosting side. */
export type RpcRequestKind =
    | "hello" | "get-schema"
    | "call" | "send"
    | "subscribe" | "unsubscribe"
    | "iterate" | "pull" | "return" | "raise";

/** RESPONSE / announcement kinds — always sent by the hosting side toward the caller. */
export type RpcResponseKind =
    | "welcome" | "available" | "unavailable" | "schema"
    | "resolve" | "reject"
    | "next"
    | "yield" | "done" | "throw";

export type RpcMessage =
    // ---- handshake (both sides send `hello`, reply `welcome`) ----
    | { readonly kind: "hello"; readonly protocol: number }
    | { readonly kind: "welcome"; readonly protocol: number }

    // ---- exposure announcements (host → caller) ----
    | { readonly kind: "available"; readonly service: string; readonly schema: Schema }
    | { readonly kind: "unavailable"; readonly service: string }

    // ---- schema fetch (runtime `consume(name)`) ----
    | { readonly kind: "get-schema"; readonly id: number; readonly service: string }
    | { readonly kind: "schema"; readonly id: number; readonly service: string; readonly schema: Schema | null }

    // ---- promise call ----
    | { readonly kind: "call"; readonly id: number; readonly service: string; readonly path: readonly string[]; readonly args: readonly Data[]; readonly deadline?: number }
    | { readonly kind: "resolve"; readonly id: number; readonly value: Data }
    | { readonly kind: "reject"; readonly id: number; readonly error: RpcError }

    // ---- void fire-and-forget ----
    | { readonly kind: "send"; readonly id: number; readonly service: string; readonly path: readonly string[]; readonly args: readonly Data[] }

    // ---- observe subscription ----
    | { readonly kind: "subscribe"; readonly id: number; readonly service: string; readonly path: readonly string[]; readonly args: readonly Data[] }
    | { readonly kind: "next"; readonly id: number; readonly value: Data }
    | { readonly kind: "unsubscribe"; readonly id: number }

    // ---- pull-based async generator (strict lockstep: one `pull` ⇒ one `yield`/`done`/`throw`) ----
    | { readonly kind: "iterate"; readonly id: number; readonly service: string; readonly path: readonly string[]; readonly args: readonly Data[] }
    | { readonly kind: "pull"; readonly id: number }
    | { readonly kind: "yield"; readonly id: number; readonly value: Data }
    | { readonly kind: "done"; readonly id: number; readonly value?: Data }
    | { readonly kind: "throw"; readonly id: number; readonly error: RpcError }
    | { readonly kind: "return"; readonly id: number }
    | { readonly kind: "raise"; readonly id: number; readonly error: RpcError };
