// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Data is readonly JSON.
 * This type forms the foundation for all of our internal state models and interfaces to external APIs.
 * It is easy to serialize/deserialize/compare/hash/cache and validate (with JSON-Schema).
 * These traits make it an ideal foundation for building a robust state engine which cannot enter into invalid states.
 * It also allows us to strongly define contracts between our application and external services.
 * Validation of input arguments and output results allows strict enforcement of agreed upon contracts.
 */
export type Data =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<Data>
  | { readonly [K in string]?: Data };
