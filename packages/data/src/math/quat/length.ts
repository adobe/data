// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";

export const length = ([x, y, z, w]: Quat): number => Math.sqrt(x * x + y * y + z * z + w * w);
