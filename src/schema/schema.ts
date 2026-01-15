// © 2026 Adobe. MIT License. See /LICENSE for details.

import { TypedBuffer } from "../typed-buffer/typed-buffer.js";
import { DeepReadonly, EquivalentTypes, True } from "../types/types.js";

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

export interface UIProperties {
  name?: string;
  icon?: string; // url? or icon name?
  summary?: string;
  premium?: boolean;
  placeholder?: string;
  details?: string;
  visible?: boolean;
  enabled?: boolean;
  infoUrl?: string;
  group?: string;
  order?: number;
  groups?: {
    readonly [key: string]: UIProperties;
  };
}

const schemaTypes = { number: true, integer: true, string: true, boolean: true, null: true, array: true, object: true, 'typed-buffer': true, blob: true } as const;

export interface Schema {
  type?: keyof typeof schemaTypes;
  conditionals?: readonly Conditional[];
  ui?: UIProperties;
  transient?: boolean;
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
  const?: any;
  enum?: readonly any[];
  layout?: Layout; // Memory layout for typed buffers (std140 or packed)
}
