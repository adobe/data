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
  },
});

class _CountElement extends DatabaseElement<typeof plugin> {
  get plugin() {
    return plugin;
  }
}

type ServiceType = _CountElement["service"];
type RawDatabase = Database.Plugin.ToDatabase<typeof plugin>;

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

// ----------------------------------------------------------------------------
// Local helpers (kept inline so this file stays a self-contained type test).
// ----------------------------------------------------------------------------

type Assert<T extends true> = T;
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
  ? true
  : false;
type NotEqual<X, Y> = Equal<X, Y> extends true ? false : true;
