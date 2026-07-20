// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";

export const scale = ([x, y, z, w]: Quat, s: number): Quat => [x * s, y * s, z * s, w * s];
