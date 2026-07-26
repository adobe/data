// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Type-level tests for {@link UIService.FromDatabase} — the database-aware UI
 * restriction.
 *
 * On top of everything {@link UIService.FromService} does (mutator returns
 * rewritten to `void`, `Observe` surfaces preserved), a transaction shadowed by
 * a same-named action is masked out of `transactions`, so UI code must call the
 * action instead of the raw transaction.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type { Observe } from "../../observe/index.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";
import type { Service } from "../service.js";
import { UIService } from "./ui-service.js";

// A database-shaped service: `save` exists as both a transaction and an action;
// `reset` is a transaction with no shadowing action.
interface CounterDatabase extends Service {
  readonly count: Observe<number>;
  readonly transactions: Service & {
    readonly save: (input: { readonly value: number }) => number;
    readonly reset: () => void;
  };
  readonly actions: Service & {
    readonly save: (input: { readonly value: number }) => Promise<void>;
  };
}

type UIView = UIService.FromDatabase<CounterDatabase>;

// The shadowed transaction is masked out of the UI view's `transactions`.
type _CheckSaveMasked = Assert<
  Equal<Extract<keyof UIView["transactions"], "save">, never>
>;

// The unshadowed transaction survives, its return preserved as void.
type _CheckResetSurvives = Assert<Equal<UIView["transactions"]["reset"], () => void>>;

// The action survives as the UI entry point, its Promise return rewritten to void.
type _CheckSaveActionVoid = Assert<
  Equal<UIView["actions"]["save"], (input: { readonly value: number }) => void>
>;

// Observe surfaces still pass through untouched.
type _CheckObservePreserved = Assert<Equal<UIView["count"], Observe<number>>>;

// A service with no `actions` member is restricted but never masked —
// FromDatabase degrades to FromService.
interface PlainBackend extends Service {
  readonly transactions: Service & {
    readonly save: () => number;
  };
}
type _CheckNoActionsPassthrough = Assert<
  Equal<UIService.FromDatabase<PlainBackend>, UIService.FromService<PlainBackend>>
>;
