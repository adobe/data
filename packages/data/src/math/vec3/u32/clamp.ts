// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";
import { max } from "./max.js";
import { min } from "./min.js";

export const clamp = (v: Vec3_U32, minVec: Vec3_U32, maxVec: Vec3_U32): Vec3_U32 => min(max(v, minVec), maxVec);
