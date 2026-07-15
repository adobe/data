// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";

export type FromComponents<
  P extends { readonly [K in string]: Schema },
  R extends readonly (keyof P & string)[],
> = {
  readonly type: "object";
  readonly properties: P;
  readonly required: R;
};

export function FromComponents<
  const P extends { readonly [K in string]: Schema },
  const R extends readonly (keyof P & string)[],
>(components: P, required: R): FromComponents<P, R>;

export function FromComponents<
  const P extends { readonly [K in string]: Schema },
>(components: P): FromComponents<P, readonly (keyof P & string)[]>;

export function FromComponents<
  const P extends { readonly [K in string]: Schema },
  const R extends readonly (keyof P & string)[],
>(components: P, required?: R) {
  return {
    type: "object",
    properties: components,
    required: required ?? Object.keys(components),
  } as const satisfies Schema;
}
