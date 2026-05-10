// © 2026 Adobe. MIT License. See /LICENSE for details.

import { isPromise } from "../../../internal/promise/is-promise.js";
import { isAsyncGenerator } from "../../../internal/async-generator/is-async-generator.js";
import { Observe } from "../../../observe/index.js";
import { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import { TransactionResult } from "../transactional-store/index.js";
import type { DatabaseSyncOptions } from "./create-database.js";

/**
 * Why an envelope intent matters: from the wire's perspective both a deferred
 * commit and an async-generator yield apply locally with `time < 0`. The
 * intent records the wrapper's reason for emitting the envelope so a sync
 * service can route each one correctly without re-deriving it from the time
 * sign.
 */
export type TransactionIntent = "commit" | "transient" | "cancel";

export type TransactionEnvelopeEvent = {
    readonly envelope: TransactionEnvelope;
    readonly result: TransactionResult<unknown> | undefined;
    readonly intent: TransactionIntent;
};

/**
 * Subset of a reconciling database the dispatcher needs to drive: just the
 * `apply` entry point. Kept minimal so this file stays focused on the
 * envelope/intent abstraction and doesn't reach into the rest of the
 * database surface.
 */
export type DispatcherTarget = (
    envelope: TransactionEnvelope<string>,
) => TransactionResult<unknown> | undefined;

/**
 * Encapsulates everything related to turning a `db.transactions.X(args)` call
 * into one or more locally-applied envelopes plus an outbound notification.
 *
 * Responsibilities owned by the dispatcher (and only by the dispatcher):
 *
 *   - The per-database transaction id counter.
 *   - Resolving the `args` argument shape (plain value, promise, or
 *     async-generator factory) into a sequence of `applyTransient` /
 *     `applyCommit` / `cancelPending` calls.
 *   - Whether a "commit" intent should be applied as a positive-time commit
 *     (local-only mode) or a negative-time transient pending server echo
 *     (sync mode). Decided once at construction by the presence of
 *     `sync` — never mutated at runtime.
 *   - Stamping `userId` onto every envelope (sync mode only).
 *   - Notifying `observe.envelopes` exactly once per emitted envelope, with
 *     the wrapper's `intent`.
 *
 * Responsibilities the dispatcher does NOT touch:
 *
 *   - Plugin extension, services, computed values, systems, etc.
 *   - The `Database` interface shape itself (just the `apply` entry point).
 *   - Inbound `db.apply(envelope)` from sync services — those go straight to
 *     the reconciler and intentionally do not fire `observe.envelopes`.
 */
export interface TransactionDispatcher {
    /**
     * Build the user-facing transaction function for a given transaction
     * name. The returned function is what gets stored under
     * `db.transactions[name]`.
     */
    readonly wrap: (name: string) => (args: unknown) => unknown;
    /** Outbound envelope event. See `Database.observe.envelopes`. */
    readonly envelopes: Observe<TransactionEnvelopeEvent>;
}

export const createTransactionDispatcher = (
    apply: DispatcherTarget,
    sync: DatabaseSyncOptions | undefined,
): TransactionDispatcher => {
    const [envelopes, notifyEnvelope] = Observe.createEvent<TransactionEnvelopeEvent>();

    // Sync mode is decided once at construction. Presence of `sync` means:
    //   - userId is stamped on every envelope
    //   - "commit" intents apply locally as transients (negative time) and
    //     wait for the sync server's echoed `committed` envelope to promote
    //     them via the reconciler's rebase-replay
    const userId = sync?.userId;
    const deferredCommit = sync !== undefined;

    let nextTransactionId = 1;

    const dispatchEnvelope = (
        envelope: TransactionEnvelope,
        intent: TransactionIntent,
    ): TransactionResult<unknown> | undefined => {
        const result = apply(envelope);
        notifyEnvelope({ envelope, result, intent });
        return result;
    };

    const wrap: TransactionDispatcher["wrap"] = (name) => (args) => {
        const transactionId = nextTransactionId++;
        let hasTransient = false;

        const applyTransient = (payload: unknown) => {
            hasTransient = true;
            dispatchEnvelope(
                { id: transactionId, userId, name, args: payload, time: -Date.now() },
                "transient",
            );
        };

        const applyCommit = (payload: unknown) => {
            // In sync mode the commit is applied locally as a transient
            // and the server's echoed `committed` envelope will promote it.
            // In local-only mode it commits immediately with positive time.
            const time = deferredCommit ? -Date.now() : Date.now();
            const result = dispatchEnvelope(
                { id: transactionId, userId, name, args: payload, time },
                "commit",
            );
            hasTransient = deferredCommit;
            return result?.value;
        };

        const cancelPending = () => {
            if (!hasTransient) return;
            dispatchEnvelope(
                { id: transactionId, userId, name, args: undefined, time: 0 },
                "cancel",
            );
            hasTransient = false;
        };

        return runTransaction(args, applyTransient, applyCommit, cancelPending);
    };

    return { wrap, envelopes };
};

/**
 * Resolves the `args` shape passed to `db.transactions.X(args)` into the
 * appropriate `applyTransient` / `applyCommit` / `cancelPending` sequence.
 *
 * Three argument shapes are supported:
 *
 *   - Plain value: a single `applyCommit(args)`.
 *   - Function returning a `Promise`: `applyCommit(await promise)`, with
 *     `cancelPending` on rejection.
 *   - Function returning an `AsyncGenerator`: each yielded value becomes an
 *     `applyTransient`; on `done`, the final yielded value (or the explicit
 *     return value if defined) becomes `applyCommit`. If no value was ever
 *     yielded and none returned, `cancelPending` runs instead. A thrown
 *     iterator results in `cancelPending` plus a rejected promise — this is
 *     how never-ending transactions (e.g. presence streams) cleanly tear
 *     down without promoting their last sample to a commit.
 */
const runTransaction = (
    args: unknown,
    applyTransient: (payload: unknown) => void,
    applyCommit: (payload: unknown) => unknown,
    cancelPending: () => void,
): unknown => {
    if (typeof args !== "function") {
        return applyCommit(args);
    }

    const providerResult = (args as () => Promise<unknown> | AsyncGenerator<unknown>)();

    if (isAsyncGenerator(providerResult)) {
        return new Promise((resolve, reject) => {
            (async () => {
                let lastArgs: unknown;
                try {
                    let iteration = await providerResult.next();
                    while (!iteration.done) {
                        lastArgs = iteration.value;
                        applyTransient(iteration.value);
                        iteration = await providerResult.next();
                    }
                    const finalArgs = iteration.value !== undefined ? iteration.value : lastArgs;
                    if (finalArgs !== undefined) {
                        resolve(applyCommit(finalArgs));
                    } else {
                        cancelPending();
                        resolve(undefined);
                    }
                } catch (e) {
                    cancelPending();
                    reject(e);
                }
            })();
        });
    }

    if (isPromise(providerResult)) {
        return (async () => {
            try {
                return applyCommit(await providerResult);
            } catch (e) {
                cancelPending();
                throw e;
            }
        })();
    }

    return applyCommit(providerResult);
};
