// © 2026 Adobe. MIT License. See /LICENSE for details.

export type JSONPath = string;
export type JSONMergePatch = unknown;

export type Layout = "std140" | "packed";

/**
 * Conditional patch applied to the path when the enclosing schema branch is active
 * and `match` is not present or validates against the root.
 * This is used for dynamic schemas which change in response to the value of the data.
 */
export type Conditional = {
  match?: Schema;
  // // root-anchored JSONPath
  path: JSONPath;
  // // JSON-Merge-Patch fragment
  value: JSONMergePatch;
}

const schemaTypes = { number: true, integer: true, string: true, boolean: true, null: true, array: true, object: true, 'typed-buffer': true, blob: true } as const;

export interface Schema {
  type?: keyof typeof schemaTypes;
  title?: string;
  description?: string;
  conditionals?: readonly Conditional[];
  nonPersistent?: boolean;
  // When true (only valid on a primitive schema), every distinct runtime value
  // of this component is stored in its own archetype: the value is lifted into
  // archetype identity and held as a const column (zero per-row bytes). Entities
  // sharing a value are therefore contiguous — the storage-level partition a
  // coarse spatial broad-phase wants. See the archetype `Router` return of
  // `ensureArchetype` and the partition `where` filter on `queryArchetypes`.
  partition?: boolean;
  mutable?: boolean; // defaults to false
  default?: any;
  precision?: 1 | 2;
  multipleOf?: number;
  mediaType?: string; // media type such as image/jpeg, image/png, video/* etc.
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: Schema;
  properties?: { readonly [key: string]: Schema };
  required?: readonly string[];
  additionalProperties?: boolean | Schema;
  oneOf?: readonly Schema[];
  allOf?: readonly Schema[];
  anyOf?: readonly Schema[];
  const?: any;
  enum?: readonly any[];
  layout?: Layout; // Memory layout for typed buffers (std140 or packed)
  // Per-type interpolation overrides used by the animation system. Schemas omit
  // this when the componentwise lerp / step default is correct (Vec3, scalar, …).
  // Quat declares { linear: slerp } so quaternion tracks are interpolated on the
  // 4-sphere instead of component-wise.
  interpolators?: {
    readonly linear?: (prev: any, next: any, t: number) => any;
    readonly step?: (prev: any, next: any, t: number) => any;
    readonly cubicSpline?: (prev: any, next: any, t: number) => any;
  };
}
