// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 } from "./index.js";

export const shiftRight = (n: U32, shift: number): U32 => (n >>> shift) >>> 0;
