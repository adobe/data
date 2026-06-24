// © 2026 Adobe. MIT License. See /LICENSE for details.

// Defined directly rather than via Schema.ToType<typeof schema> so the schema
// can declare interpolators that reference functions whose own signatures
// use Quat — otherwise the type alias would be circular.
export type Quat = readonly [number, number, number, number];

export * as Quat from "./public.js";
