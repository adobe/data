// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { length } from "./length.js";
import { subtract } from "./subtract.js";

export const distance = (a: F32, b: F32): number => length(subtract(b, a));
