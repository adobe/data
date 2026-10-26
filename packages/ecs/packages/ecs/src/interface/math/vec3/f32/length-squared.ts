// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";
import { dot } from "./dot.js";

export const lengthSquared = (v: F32): number => dot(v, v);
