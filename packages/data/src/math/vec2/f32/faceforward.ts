// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { negate } from "./negate.js";

export const faceforward = (n: F32, i: F32, nref: F32): F32 => 
    dot(nref, i) < 0 ? n : negate(n);
