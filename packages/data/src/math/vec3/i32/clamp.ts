// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";
import { max } from "./max.js";
import { min } from "./min.js";

export const clamp = (v: Vec3_I32, minVec: Vec3_I32, maxVec: Vec3_I32): Vec3_I32 => min(max(v, minVec), maxVec);
