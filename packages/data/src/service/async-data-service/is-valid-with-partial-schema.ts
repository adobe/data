// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";
import { IsValid } from "./is-valid.js";

/**
 * A valid async data service whose members INCLUDE everything the object schema
 * `S` describes: a partial (subset) schema. Every described member must exist on
 * the service with a compatible type, but the service MAY expose additional,
 * undescribed members.
 *
 * `S` is sideloaded — supplied as a second type argument from `typeof MyService.schema`
 * (a `... as const satisfies Schema`), never read off the service instance.
 */
export type IsValidWithPartialSchema<T extends Service, S extends Schema> =
  IsValid<T> extends true
  ? [Omit<T, keyof Service>] extends [Schema.ToType<S>] ? true : false
  : false;

// ---- Tests -----------------------------------------------------------------

interface _AccountService extends Service {
  balance: Observe<number>;
  deposit: (amount: number) => Promise<number>;
}

const _partialSchema = {
  type: "object",
  properties: {
    balance: { type: "observe", value: { type: "number" }, description: "current balance" },
  },
  required: ["balance"],
  additionalProperties: false,
} as const satisfies Schema;

const _wrongTypeSchema = {
  type: "object",
  properties: {
    balance: { type: "observe", value: { type: "string" }, description: "should be a number" },
  },
  required: ["balance"],
  additionalProperties: false,
} as const satisfies Schema;

const _extraMemberSchema = {
  type: "object",
  properties: {
    balance: { type: "observe", value: { type: "number" }, description: "current balance" },
    nonexistent: { type: "observe", value: { type: "number" }, description: "not on the service" },
  },
  required: ["balance", "nonexistent"],
  additionalProperties: false,
} as const satisfies Schema;

// Positive: a partial schema is a valid subset (service may have more members).
type _CheckPartialMatches = Assert<IsValidWithPartialSchema<_AccountService, typeof _partialSchema>>;

// Negative: a described member with the wrong type fails.
// @ts-expect-error — balance is a number on the service, but string in the schema
type _CheckWrongTypeFails = Assert<IsValidWithPartialSchema<_AccountService, typeof _wrongTypeSchema>>;

// Negative: describing a member the service lacks fails.
// @ts-expect-error — `nonexistent` is not a member of _AccountService
type _CheckExtraDescribedFails = Assert<IsValidWithPartialSchema<_AccountService, typeof _extraMemberSchema>>;
