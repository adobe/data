// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Observe } from "../../observe/index.js";
import type { AsyncArgsProvider } from "../../types/async-args-provider.js";
import type { Service } from "../service.js";
import type { IsValid } from "./is-valid.js";

/**
 * Restricts a single property to the UIService shape:
 * - `Observe<T>` properties pass through unchanged.
 * - Functions returning `Observe<T>` pass through unchanged.
 * - Transaction-shaped overloads (an `AsyncArgsProvider` variant paired with a
 *   plain-args variant) keep BOTH call signatures, with each return rewritten
 *   to `void`. This is what lets a UI consumer drive a live, single-commit
 *   gesture (drag / slider / stream) through the restricted `service` — e.g.
 *   `use-drag-transaction`, which requires `(AsyncArgsProvider<T>) => void`.
 * - Any other function has its return type rewritten to `void`, turning it
 *   into a fire-and-forget action.
 * - Nested objects are recursively restricted.
 * - Other shapes (primitives such as `serviceName`) pass through unchanged.
 *
 * The transaction-overload check must precede the generic function check:
 * TypeScript's `infer` on a function type sees only the *last* overload
 * signature, so a plain `(...args) => R` match would silently discard the
 * `AsyncArgsProvider` overload. The generic function check must in turn
 * precede the object check because functions are also `extends object`.
 */
type RestrictProperty<P> =
  P extends Observe<any>
  ? P
  : P extends {
    (arg: AsyncArgsProvider<infer Input>): Promise<any>;
    (arg: infer SyncInput): any;
  }
  ? {
    (arg: AsyncArgsProvider<Input>): void;
    (arg: SyncInput): void;
  }
  : P extends (...args: infer Args) => infer R
  ? R extends Observe<any>
  ? P
  : (...args: Args) => void
  : P extends object
  ? { [K in keyof P]: RestrictProperty<P[K]> }
  : P;

type Restrict<T> = {
  [K in keyof T]: RestrictProperty<T[K]>
};

/**
 * Converts a service type to its UI-facing interface.
 *
 * - If `T` is already a valid UIService, yields `T` unchanged so consumers
 *   keep the original type name in errors and hovers.
 * - Otherwise, recursively rewrites every function whose return type is not
 *   `Observe<...>` to return `void`, enforcing unidirectional control flow
 *   for UI consumers.
 *
 * Used to constrain `service` properties on UI container elements so a
 * widget can never await on or read from a transaction / action call.
 */
export type FromService<T extends Service> =
  IsValid<T> extends true ? T : Restrict<T>;
