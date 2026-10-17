/** Vectors of integers in [0, 2^32). Functions wrap as WGSL's u32 does; for other values their results are indeterminate. */
export type U32 = readonly [number, number, number];

export * as U32 from "./public.js";
