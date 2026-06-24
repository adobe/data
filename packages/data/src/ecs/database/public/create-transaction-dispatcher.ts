// © 2026 Adobe. MIT License. See /LICENSE for details.

import { isPromise } from "../../../internal/promise/is-promise.js";
import { isAsyncGenerator } from "../../../internal/async-generator/is-async-generator.js";
import { Observe } from "../../../observe/index.js";
import { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import { TransactionResult } from "../transactional-store/index.js";

/**
 * Why an envelope intent matters: from the wire's perspective both a deferred
 * commit and an async-generator yield apply locally with `time < 0`. The
 * intent records the wrapper's reason for emitting the envelope so a sync
 * service can route each one correctly without re-deriving it from the time
 * sign. `"intermediate"` means a non-final step in an async sequence.
 */
export type TransactionIntent = "commit" | "intermediate" | "cancel";

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
 *     async-generator factory) into a sequence of `applyIntermediate` /
 *     `applyCommit` / `cancelPending` calls.
 *   - Whether a "commit" intent should be applied as a positive-time commit
 *     (local-only mode) or a negative-time intermediate step pending server echo
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
    options: { deferredCommit: boolean; userId?: number | string },
): TransactionDispatcher => {
    const [envelopes, notifyEnvelope] = Observe.createEvent<TransactionEnvelopeEvent>();

    const { deferredCommit, userId } = options;

    let nextTransactionId = 1;

    const dispatchEnvelope = (
        envelope: TransactionEnvelope,
        intent: TransactionIntent,
    ): TransactionResult<unknown> | undefined => {
        const result = apply(envelope);
        // Suppress envelope events for no-ops so they never reach the sync
        // service and are never forwarded to peers. Cancel envelopes have
        // result === undefined and are always forwarded.
        const isNoOp = result !== undefined && result.redo.length === 0 && result.undo.length === 0;
        if (!isNoOp) {
            notifyEnvelope({ envelope, result, intent });
        }
        return result;
    };

    const wrap: TransactionDispatcher["wrap"] = (name) => (args) => {
        const transactionId = nextTransactionId++;
        let hasIntermediate = false;

        const applyIntermediate = (payload: unknown) => {
            hasIntermediate = true;
            dispatchEnvelope(
                { id: transactionId, userId, name, args: payload, time: -Date.now() },
                "intermediate",
            );
        };

        const applyCommit = (payload: unknown) => {
            // In sync mode the commit is applied locally as an intermediate step
            // and the server's echoed `committed` envelope will promote it.
            // In local-only mode it commits immediately with positive time.
            const time = deferredCommit ? -Date.now() : Date.now();
            const result = dispatchEnvelope(
                { id: transactionId, userId, name, args: payload, time },
                "commit",
            );
            // Only mark a pending intermediate if the envelope was effective (not
            // a no-op). A no-op envelope is suppressed by dispatchEnvelope and
            // will never receive a server promotion, so we must not set
            // hasIntermediate — doing so would cause a spurious cancel later.
            const effective = result === undefined || result.redo.length > 0 || result.undo.length > 0;
            hasIntermediate = deferredCommit && effective;
            return result?.value;
        };

        const cancelPending = () => {
            if (!hasIntermediate) return;
            dispatchEnvelope(
                { id: transactionId, userId, name, args: undefined, time: 0 },
                "cancel",
            );
            hasIntermediate = false;
        };

        return runTransaction(args, applyIntermediate, applyCommit, cancelPending);
    };

    return { wrap, envelopes };
};

/**
 * Resolves the `args` shape passed to `db.transactions.X(args)` into the
 * appropriate `applyIntermediate` / `applyCommit` / `cancelPending` sequence.
 *
 * Three argument shapes are supported:
 *
 *   - Plain value: a single `applyCommit(args)`.
 *   - Function returning a `Promise`: `applyCommit(await promise)`, with
 *     `cancelPending` on rejection.
 *   - Function returning an `AsyncGenerator`: each yielded value becomes an
 *     `applyIntermediate`; on `done`, the final yielded value (or the explicit
 *     return value if defined) becomes `applyCommit`. If no value was ever
 *     yielded and none returned, `cancelPending` runs instead. A thrown
 *     iterator results in `cancelPending` plus a rejected promise — this is
 *     how never-ending transactions (e.g. presence streams) cleanly tear
 *     down without promoting their last sample to a commit.
 */
const runTransaction = (
    args: unknown,
    applyIntermediate: (payload: unknown) => void,
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
                        applyIntermediate(iteration.value);
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
