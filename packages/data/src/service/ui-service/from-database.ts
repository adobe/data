// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Service } from "../service.js";
import type { FromService } from "./from-service.js";

// The action names a sub-service exposes, excluding the base `Service` members
// (`serviceName`) every sub-service carries via its `& Service` intersection.
type ActionNames<A> = Exclude<keyof A, keyof Service>;

// When a service exposes both `transactions` and `actions` sub-services, hide
// every transaction whose name is also an action: the action is the sanctioned
// UI entry point (it wraps the transaction with async work / side effects), so
// the raw transaction must not be reachable through the UI view. Services
// without both members pass through unchanged.
type MaskShadowedTransactions<T> =
  T extends { transactions: infer TX; actions: infer AC }
  ? Omit<T, "transactions"> & {
    readonly transactions: Omit<TX, ActionNames<AC>>;
  }
  : T;

/**
 * The UI-facing view of a Database service — the database-aware counterpart to
 * {@link FromService}.
 *
 * Two restrictions compose:
 * - {@link FromService}: every mutator return is rewritten to `void`; `Observe`
 *   surfaces (and transaction overloads driving live gestures) pass through.
 * - *Action masking*: any transaction shadowed by a same-named action is
 *   removed from `transactions`. Calling a transaction directly is fine in
 *   general, but once it is wrapped in an action the action is the intended
 *   entry point — the UI must go through it, so the raw transaction is masked
 *   out of the type and can no longer be called.
 *
 * Masking runs before the restriction so `FromService` only ever sees the
 * transactions that survive.
 */
export type FromDatabase<T extends Service> = FromService<MaskShadowedTransactions<T>>;
