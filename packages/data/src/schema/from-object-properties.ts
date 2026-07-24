// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";

type FromObjectProperties<
  P extends { readonly [K in string]: Schema },
  R extends readonly (keyof P & string)[],
> = {
  readonly type: "object";
  readonly properties: P;
  readonly required: R;
};

export function fromObjectProperties<
  const P extends { readonly [K in string]: Schema },
  const R extends readonly (keyof P & string)[],
>(properties: P, required: R): FromObjectProperties<P, R>;

export function fromObjectProperties<
  const P extends { readonly [K in string]: Schema },
>(properties: P): FromObjectProperties<P, readonly (keyof P & string)[]>;

export function fromObjectProperties<
  const P extends { readonly [K in string]: Schema },
  const R extends readonly (keyof P & string)[],
>(properties: P, required?: R) {
  return {
    type: "object",
    properties,
    required: required ?? Object.keys(properties),
  } as const satisfies Schema;
}
