// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";
import { EquivalentTypes, False, True } from "../../types/types.js";
import { IsValid } from "./is-valid.js";

/**
 * A valid async data service whose members are EXACTLY what the object schema `S`
 * describes: no described member missing, and no undescribed member present.
 *
 * `S` is sideloaded — supplied as a second type argument from `typeof MyService.schema`
 * (a `... as const satisfies Schema`), never read off the service instance. For an
 * exact match, `S` needs `required: [...all members]` and `additionalProperties: false`.
 */
export type IsValidWithCompleteSchema<T extends Service, S extends Schema> =
  IsValid<T> extends true
  ? EquivalentTypes<Schema.ToType<S>, Omit<T, keyof Service>>
  : false;

// ---- Tests -----------------------------------------------------------------

interface _AccountService extends Service {
  balance: Observe<number>;
  deposit: (amount: number) => Promise<number>;
}

const _accountSchema = {
  type: "object",
  properties: {
    balance: { type: "observe", value: { type: "number" }, description: "current balance" },
    deposit: {
      type: "function",
      signature: {
        parameters: [{ type: "number" }],
        returns: { type: "promise", value: { type: "number" } },
      },
      description: "add funds; resolves to the new balance",
    },
  },
  required: ["balance", "deposit"],
  additionalProperties: false,
} as const satisfies Schema;

const _incompleteSchema = {
  type: "object",
  properties: {
    balance: { type: "observe", value: { type: "number" }, description: "current balance" },
  },
  required: ["balance"],
  additionalProperties: false,
} as const satisfies Schema;

// Positive: the schema matches the service exactly.
type _CheckComplete = Assert<IsValidWithCompleteSchema<_AccountService, typeof _accountSchema>>;

// Negative: an incomplete schema is not a complete description (missing `deposit`).
// @ts-expect-error — schema omits the `deposit` member
type _CheckIncompleteFails = Assert<IsValidWithCompleteSchema<_AccountService, typeof _incompleteSchema>>;

// ---- Blob: describable as both an observed property and a return value -----

interface _AssetService extends Service {
  thumbnail: Observe<Blob>;
  download: (id: string) => Promise<Blob>;
}

const _assetSchema = {
  type: "object",
  properties: {
    thumbnail: { type: "observe", value: { type: "blob" }, description: "current thumbnail" },
    download: {
      type: "function",
      signature: {
        parameters: [{ type: "string" }],
        returns: { type: "promise", value: { type: "blob" } },
      },
      description: "download an asset by id",
    },
  },
  required: ["thumbnail", "download"],
  additionalProperties: false,
} as const satisfies Schema;

type _CheckBlobComplete = Assert<IsValidWithCompleteSchema<_AssetService, typeof _assetSchema>>;

type _AssetShape = Schema.ToType<typeof _assetSchema>;

// Positive: the blob schema resolves to `Blob` in both positions.
type _CheckBlobState = True<EquivalentTypes<_AssetShape["thumbnail"], Observe<Blob>>>;
type _CheckBlobReturn = True<EquivalentTypes<_AssetShape["download"], (id: string) => Promise<Blob>>>;

// Regression guard: only holds if `{ type: "blob" }` resolves to `Blob`, not `any`.
type _CheckBlobIsNotString = False<EquivalentTypes<_AssetShape["thumbnail"], Observe<string>>>;
