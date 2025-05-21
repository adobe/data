/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { FromSchema, Schema } from "../index.js";

export function Nullable<T extends Schema>(
  schema: T
): { oneOf: [T, { type: "null" }] } {
  return {
    oneOf: [schema, { type: "null" }],
  };
}

export function Tuple<T extends Schema, N extends number>(items: T, length: N) {
  return { type: "array", items, minItems: length, maxItems: length } as const satisfies Schema;
}

export const TrueSchema = {
  const: true,
} as const satisfies Schema;

export const BooleanSchema = {
  type: "boolean",
} as const satisfies Schema;

export const Float32Schema = {
  type: "number",
  precision: 1,
} as const satisfies Schema;

export const Float64Schema = {
  type: "number",
  precision: 2,
} as const satisfies Schema;

export const TimeSchema = Float64Schema;

export const Uint8Schema = {
  type: "integer",
  minimum: 0,
  maximum: 0xff,
} as const satisfies Schema;

export const Uint16Schema = {
  type: "integer",
  minimum: 0,
  maximum: 0xffff,
} as const satisfies Schema;

export const Uint32Schema = {
  type: "integer",
  minimum: 0,
  maximum: 0xffffffff,
} as const satisfies Schema;
