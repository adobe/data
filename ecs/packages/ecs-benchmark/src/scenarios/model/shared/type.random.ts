// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/** The four words of a `random_xoshiro128` generator's state. */
export type Random = readonly [U32, U32, U32, U32];
