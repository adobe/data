// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";
import { EquivalentTypes, False, True } from "../../types/types.js";
import { IsValid } from "./is-valid.js";

/**
 * A valid async data service whose members are EXACTLY what `D` describes: no
 * described member missing, and no undescribed member present.
 *
 * `D` is passed as a second type argument, sourced from `typeof theDescriptorConst`
 * (a `... as const satisfies Service.Descriptor`), so its literal shape is known.
 */
export type IsValidWithCompleteDescriptor<T extends Service, D extends Service.Descriptor> =
  IsValid<T> extends true
  ? EquivalentTypes<Service.Descriptor.ToService<D>, Omit<T, keyof Service>>
  : false;

// ---- Tests -----------------------------------------------------------------

interface _AccountService extends Service {
  balance: Observe<number>;
  deposit: (amount: number) => Promise<number>;
}

const _completeAccountDescriptor = {
  description: "An account.",
  states: { balance: { schema: { type: "number" }, description: "current balance" } },
  actions: {
    deposit: {
      parameters: [{ type: "number" }],
      result: "promise",
      returns: { type: "number" },
      description: "add funds; resolves to the new balance",
    },
  },
  services: {},
} as const satisfies Service.Descriptor;

const _incompleteAccountDescriptor = {
  description: "An account (balance only).",
  states: { balance: { schema: { type: "number" }, description: "current balance" } },
  actions: {},
  services: {},
} as const satisfies Service.Descriptor;

// Positive: the complete descriptor matches the service exactly.
type _CheckCompleteMatches = Assert<IsValidWithCompleteDescriptor<_AccountService, typeof _completeAccountDescriptor>>;

// Negative: an incomplete descriptor is NOT a complete description (missing `deposit`).
// @ts-expect-error — descriptor omits the `deposit` action, so it is not complete
type _CheckIncompleteFails = Assert<IsValidWithCompleteDescriptor<_AccountService, typeof _incompleteAccountDescriptor>>;

// ---- Blob: describable as both a property (state) and a return value -------

interface _AssetService extends Service {
  thumbnail: Observe<Blob>;                 // Blob as an observable property
  download: (id: string) => Promise<Blob>;  // Blob as an action return value
}

const _assetDescriptor = {
  description: "Serves binary assets.",
  states: { thumbnail: { schema: { type: "blob" }, description: "current thumbnail" } },
  actions: {
    download: {
      parameters: [{ type: "string" }],
      result: "promise",
      returns: { type: "blob" },
      description: "download an asset by id",
    },
  },
  services: {},
} as const satisfies Service.Descriptor;

// Positive: a Blob state and a Blob return value are described and validated.
type _CheckBlobComplete = Assert<IsValidWithCompleteDescriptor<_AssetService, typeof _assetDescriptor>>;

type _AssetShape = Service.Descriptor.ToService<typeof _assetDescriptor>;

// Positive: the blob schema resolves to `Blob` in both positions.
type _CheckBlobState = True<EquivalentTypes<_AssetShape["thumbnail"], Observe<Blob>>>;
type _CheckBlobReturn = True<EquivalentTypes<_AssetShape["download"], (id: string) => Promise<Blob>>>;

// Negative — and a regression guard: this only holds if `{ type: "blob" }`
// resolves to `Blob` rather than `any` (an `any` member would be spuriously
// equivalent to `Observe<string>`, failing this check).
type _CheckBlobIsNotString = False<EquivalentTypes<_AssetShape["thumbnail"], Observe<string>>>;
