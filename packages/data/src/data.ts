// © 2026 Adobe. MIT License. See /LICENSE for details.

import * as JsonMapSet from "./functions/serialization/stringify.js";

/**
 * Data is readonly JSON, extended with `ReadonlySet`, `ReadonlyMap`, and `Blob`.
 * This type forms the foundation for all of our internal state models and interfaces to external APIs.
 * It is easy to serialize/deserialize/compare/hash/cache and validate (with JSON-Schema).
 * These traits make it an ideal foundation for building a robust state engine which cannot enter into invalid states.
 * It also allows us to strongly define contracts between our application and external services.
 * Validation of input arguments and output results allows strict enforcement of agreed upon contracts.
 *
 * Collections carry their ordering semantics in the type: a `ReadonlyArray` is
 * ordered (position is meaningful), while a `ReadonlySet` / `ReadonlyMap` is
 * unordered. Serialize Set/Map-bearing Data with `Data.stringify` / `Data.parse`
 * (plain `JSON.stringify` cannot represent them).
 */
export type Data =
  | string
  | number
  | boolean
  | null
  | ReadonlyArray<Data>
  | ReadonlySet<Data>
  | ReadonlyMap<Data, Data>
  | { readonly [K in string]?: Data }
  | Blob;

export namespace Data {
  /** `JSON.stringify`, extended to round-trip `Map` and `Set`. */
  export import stringify = JsonMapSet.stringify;
  /** `JSON.parse`, extended to round-trip `Map` and `Set`. */
  export import parse = JsonMapSet.parse;
}
