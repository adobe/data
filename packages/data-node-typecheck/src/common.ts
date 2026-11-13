// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";

export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
export type Assert<T extends true> = T;
export type IsAny<T> = 0 extends 1 & T ? true : false;

export const surfaceSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    version: { type: "integer" },
    data: { type: "blob" },
  },
  required: ["id", "version"],
  additionalProperties: false,
} as const satisfies Schema;

export type Surface = Schema.ToType<typeof surfaceSchema>;
export type SurfaceBlob = Schema.ToType<{ type: "blob" }>;

type _NotAny = Assert<Equal<IsAny<Surface>, false>>;
type _StringNotAny = Assert<Equal<Schema.ToType<{ type: "string" }>, string>>;

export const idOf = (surface: Surface) => surface.id;
type _IdOf = Assert<Equal<ReturnType<typeof idOf>, string>>;

export const right: Surface = { id: "a", version: 1 };

// @ts-expect-error id must be a string
export const wrongId: Surface = { id: 1, version: 1 };
// @ts-expect-error version must be a number
export const wrongVersion: Surface = { id: "a", version: "one" };
// @ts-expect-error version is required
export const missing: Surface = { id: "a" };
// @ts-expect-error additional properties are rejected
export const extra: Surface = { id: "a", version: 1, other: true };

export const readonlyCheck = (surface: Surface) => {
  // @ts-expect-error ToType results are readonly
  surface.id = "b";
};
