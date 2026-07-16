// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "./schema.js";
import { fromObjectProperties } from "./from-object-properties.js";

type PickComponents<
  C extends { readonly [K in string]: Schema },
  A extends readonly (string & keyof C)[],
> = { readonly [K in A[number]]: C[K] };

function pickComponents<
  const C extends { readonly [K in string]: Schema },
  const A extends readonly (string & keyof C)[],
>(components: C, keys: A): PickComponents<C, A> {
  return Object.fromEntries(
    keys.map(key => [key, components[key]]),
  ) as PickComponents<C, A>;
}

type FromArchetype<
  C extends { readonly [K in string]: Schema },
  A extends readonly (string & keyof C)[],
> = {
  readonly type: "object";
  readonly properties: PickComponents<C, A>;
  readonly required: A;
};

export function fromArchetype<
  const C extends { readonly [K in string]: Schema },
  const A extends readonly (string & keyof C)[],
>(components: C, archetype: A): FromArchetype<C, A> {
  return fromObjectProperties(pickComponents(components, archetype), archetype);
}
