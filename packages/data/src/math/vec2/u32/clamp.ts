// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { max } from "./max.js";
import { min } from "./min.js";

export const clamp = (v: Vec2_U32, minVec: Vec2_U32, maxVec: Vec2_U32): Vec2_U32 => min(max(v, minVec), maxVec);
