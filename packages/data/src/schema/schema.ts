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
  /** @deprecated Use `nonPersistent` instead */
  ephemeral?: boolean;
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
