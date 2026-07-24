// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { max } from "./max.js";
import { min } from "./min.js";

export const clamp = (v: F32, minVec: F32, maxVec: F32): F32 => min(max(v, minVec), maxVec);
