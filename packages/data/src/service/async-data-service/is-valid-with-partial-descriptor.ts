// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";
import { IsValid } from "./is-valid.js";

/**
 * A valid async data service whose members INCLUDE everything `D` describes: a
 * partial (subset) descriptor. Every described state / action / child service
 * must exist on the service with a compatible type, but the service MAY expose
 * additional, undescribed members.
 *
 * `D` is passed as a second type argument, sourced from `typeof theDescriptorConst`
 * (a `... as const satisfies Service.Descriptor`), so its literal shape is known.
 */
export type IsValidWithPartialDescriptor<T extends Service, D extends Service.Descriptor> =
  IsValid<T> extends true
  ? [Omit<T, keyof Service>] extends [Service.Descriptor.ToService<D>] ? true : false
  : false;

// ---- Tests -----------------------------------------------------------------

interface _AccountService extends Service {
  balance: Observe<number>;
  deposit: (amount: number) => Promise<number>;
}

const _partialAccountDescriptor = {
  description: "An account (balance only).",
  states: { balance: { schema: { type: "number" }, description: "current balance" } },
  actions: {},
  services: {},
} as const satisfies Service.Descriptor;

const _wrongTypeDescriptor = {
  description: "An account with a wrongly-typed balance.",
  states: { balance: { schema: { type: "string" }, description: "should be a number" } },
  actions: {},
  services: {},
} as const satisfies Service.Descriptor;

const _extraMemberDescriptor = {
  description: "Describes a member the service does not have.",
  states: {
    balance: { schema: { type: "number" }, description: "current balance" },
    nonexistent: { schema: { type: "number" }, description: "not on the service" },
  },
  actions: {},
  services: {},
} as const satisfies Service.Descriptor;

// Positive: a partial descriptor is a valid subset (service may have more members).
type _CheckPartialMatches = Assert<IsValidWithPartialDescriptor<_AccountService, typeof _partialAccountDescriptor>>;

// Negative: a described member with the wrong type fails.
// @ts-expect-error — balance is a number on the service, but string in the descriptor
type _CheckWrongTypeFails = Assert<IsValidWithPartialDescriptor<_AccountService, typeof _wrongTypeDescriptor>>;

// Negative: describing a member the service lacks fails.
// @ts-expect-error — `nonexistent` is not a member of _AccountService
type _CheckExtraDescribedFails = Assert<IsValidWithPartialDescriptor<_AccountService, typeof _extraMemberDescriptor>>;
