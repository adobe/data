// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 } from "./index.js";

export const countLeadingZeros = (n: U32): U32 => Math.clz32(n >>> 0);
