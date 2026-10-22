// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 as Vec3_U32 } from "./u32.js";

export const volume = ([x, y, z]: Vec3_U32): number => Math.imul(Math.imul(x, y), z) >>> 0;
