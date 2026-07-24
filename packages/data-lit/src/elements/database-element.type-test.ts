// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Compile-time tests proving that `DatabaseElement.service` exposes a
 * UI-safe view of the underlying Database — every Database method that
 * originally returned a non-`void`, non-`Observe` result has its return
 * type rewritten to `void`, while Observe surfaces pass through unchanged.
 *
 * If `UIService.FromService` ever stops applying to the inferred
 * `service` type, one or more of these assertions will fail at build time.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Database } from "@adobe/data/ecs";
import type { AsyncArgsProvider } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { UIService } from "@adobe/data/service";
import { DatabaseElement } from "./database-element.js";

const plugin = Database.Plugin.create({
  resources: {
    count: { default: 0 as number },
  },
  transactions: {
    increment: (t) => {
      t.resources.count = t.resources.count + 1;
    },
    setCount: (t, input: { readonly value: number }) => {
      t.resources.count = input.value;
    },
  },
});

class _CountElement extends DatabaseElement<typeof plugin> {
  get plugin() {
    return plugin;
  }
}

type ServiceType = _CountElement["service"];
type RawDatabase = Database.Plugin.ToDatabase<typeof plugin>;

// 0. `service` is a read/write accessor: the getter returns the restricted view,
//    while the setter accepts the full database (injection). The divergent
//    get/set types are intentional (legal since TS 5.1).
const _injectFullDatabase = (el: _CountElement, db: RawDatabase): void => {
  el.service = db;
};
// A side effect of the divergence: `el.service = el.service` is a type error,
// since the restricted getter type is not assignable to the full setter type.
const _rejectRestrictedAssignment = (el: _CountElement): void => {
  // @ts-expect-error restricted view is not assignable back to the full database
  el.service = el.service;
};

// 0a. The full database is fully encapsulated: there is no `database` member of
//     any visibility on the instance type. `service` is the only surface.
const _noPublicDatabaseProperty = (el: _CountElement): void => {
  // @ts-expect-error `database` no longer exists; the full db is hard-private
  void el.database;
};
type _CheckNoDatabaseKey = Assert<Equal<Extract<keyof _CountElement, "database">, never>>;

// 1. The exposed service type is the UIService-restricted view of the database.
type _CheckRestricted = Assert<Equal<ServiceType, UIService.FromService<RawDatabase>>>;

// 2. Observe surfaces survive the restriction.
type _CheckResourceObserveSurvives = Assert<
  Equal<ServiceType["observe"]["resources"]["count"], Observe<number>>
>;
type _CheckEnvelopeObserveSurvives = Assert<
  Equal<ServiceType["observe"]["envelopes"], RawDatabase["observe"]["envelopes"]>
>;

// 3. `apply` raw return type is non-void; restriction rewrites it to void.
type RawApply = RawDatabase["apply"];
type RestrictedApply = ServiceType["apply"];
type _CheckRawApplyIsNotVoid = Assert<NotEqual<ReturnType<RawApply>, void>>;
type _CheckRestrictedApplyIsVoid = Assert<Equal<ReturnType<RestrictedApply>, void>>;
type _CheckRestrictedApplyKeepsArgs = Assert<
  Equal<Parameters<RestrictedApply>, Parameters<RawApply>>
>;

// 4. `toData` raw return is `unknown`; restriction rewrites to void.
type _CheckRawToDataNotVoid = Assert<NotEqual<ReturnType<RawDatabase["toData"]>, void>>;
type _CheckRestrictedToDataVoid = Assert<Equal<ReturnType<ServiceType["toData"]>, void>>;

// 5. Already-void functions pass through unchanged.
type _CheckResetStillVoid = Assert<Equal<ReturnType<ServiceType["reset"]>, void>>;
type _CheckCancelStillVoid = Assert<Equal<ReturnType<ServiceType["cancel"]>, void>>;

// 6. Transaction functions (nested under `transactions`) get their return
//    rewritten to void by the same recursion. The plugin's `increment`
//    happens to already be void, so we check the structure stays a function
//    returning void after the restriction.
type _CheckIncrementReturnsVoid = Assert<
  Equal<ReturnType<ServiceType["transactions"]["increment"]>, void>
>;

// 7. A transaction with input is exposed as an overload pair. The restriction
//    must preserve the AsyncArgsProvider overload (return rewritten to void) so
//    a UI element can drive a live, single-commit gesture through its
//    restricted `service` — this is exactly what `useDragTransaction`
//    consumes: `(asyncArgs: AsyncArgsProvider<T>) => void`. Regression guard
//    for the overload-erasure bug in UIService's RestrictProperty.
type DragConsumer<T> = (asyncArgs: AsyncArgsProvider<T>) => void;
const _setCountDrivable: DragConsumer<{ readonly value: number }> =
  null as unknown as ServiceType["transactions"]["setCount"];
// The plain-args (fire-and-forget) overload also survives, still returning void.
const _setCountCommit: (arg: { readonly value: number }) => void =
  null as unknown as ServiceType["transactions"]["setCount"];
type _CheckSetCountAsyncVoid = Assert<
  Equal<ReturnType<ServiceType["transactions"]["setCount"]>, void>
>;

// ----------------------------------------------------------------------------
// Local helpers (kept inline so this file stays a self-contained type test).
// ----------------------------------------------------------------------------

type Assert<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
  ? true
  : false;
type NotEqual<X, Y> = Equal<X, Y> extends true ? false : true;
